import 'server-only'
import type { Mailbox } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { calendarChanges, currentHistoryId, GmailError, GoogleAuthError, googleClient, messageMeta, messagesSince, type CalendarEvent, type MessageMeta } from '@/lib/google/client'

/**
 * Logs Gmail emails and Calendar meetings with known contacts on their
 * timelines. Only people already in Soldlyne are matched: nobody is created
 * from an inbox. Colleagues (same domain as the mailbox) are ignored.
 */

/** "Jane <jane@acme.fr>, bob@x.io" -> ["jane@acme.fr", "bob@x.io"] */
export function addressesOf(header: string | undefined): string[] {
  if (!header) return []
  return [...header.matchAll(/[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map((m) => m[0].toLowerCase())
}

const SKIP_LABELS = ['SPAM', 'TRASH', 'DRAFT', 'CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'CATEGORY_UPDATES', 'CATEGORY_FORUMS']
const AUTOMATED_SENDER = /^(no-?reply|do-?not-?reply|notifications?|mailer-daemon|postmaster|newsletter|news|bounce)[^@]*@/i

/** Newsletters, notifications and automated mail never reach a timeline. */
export function isBulk(meta: Pick<MessageMeta, 'headers' | 'labelIds'>): boolean {
  if (meta.labelIds.some((label) => SKIP_LABELS.includes(label))) return true
  const h = meta.headers
  if (h['list-unsubscribe'] || h['list-id']) return true
  if (/bulk|list|junk/i.test(h.precedence ?? '')) return true
  if (h['auto-submitted'] && !/^no$/i.test(h['auto-submitted'])) return true
  return addressesOf(h.from).some((address) => AUTOMATED_SENDER.test(address))
}

function counterparties(addresses: string[], mailbox: Pick<Mailbox, 'email'>) {
  const domain = mailbox.email.split('@')[1]
  return [...new Set(addresses)].filter((address) => address !== mailbox.email && !address.endsWith(`@${domain}`))
}

async function peopleFor(addresses: string[]) {
  if (!addresses.length) return []
  return prisma.person.findMany({ where: { deletedAt: null, emails: { hasSome: addresses } }, select: { id: true, companyId: true, emails: true } })
}

/** The open deal these people are about: one where they are the contact, else the only open deal of their company. */
async function dealFor(people: { id: string; companyId: string | null }[]) {
  const ids = people.map((p) => p.id)
  const asContact = await prisma.deal.findFirst({ where: { contactId: { in: ids }, deletedAt: null, stage: { kind: 'OPEN' } }, orderBy: { updatedAt: 'desc' } })
  if (asContact) return asContact
  const companyId = people.find((p) => p.companyId)?.companyId
  if (!companyId) return null
  const open = await prisma.deal.findMany({ where: { companyId, deletedAt: null, stage: { kind: 'OPEN' } }, take: 2 })
  return open.length === 1 ? open[0] : null
}

export async function syncEmail(mailbox: Mailbox, meta: MessageMeta): Promise<boolean> {
  if (isBulk(meta)) return false
  const from = addressesOf(meta.headers.from)
  const outbound = from.includes(mailbox.email) || meta.labelIds.includes('SENT')
  const others = counterparties([...from, ...addressesOf(meta.headers.to), ...addressesOf(meta.headers.cc)], mailbox)
  const people = await peopleFor(others)
  if (!people.length) return false
  if (await prisma.activity.findFirst({ where: { source: 'GMAIL', externalId: meta.id } })) return false
  const deal = await dealFor(people)
  await prisma.activity.create({
    data: {
      type: 'EMAIL',
      direction: outbound ? 'OUTBOUND' : 'INBOUND',
      occurredAt: new Date(meta.internalDate),
      subject: meta.headers.subject ?? null,
      body: meta.snippet,
      source: 'GMAIL',
      externalId: meta.id,
      threadId: meta.threadId,
      companyId: people.find((p) => p.companyId)?.companyId ?? deal?.companyId ?? null,
      dealId: deal?.id ?? null,
      createdBy: 'SYNC',
      participants: {
        create: people.map((person) => ({
          personId: person.id,
          handle: person.emails.find((e) => others.includes(e)) ?? person.emails[0],
          role: !outbound && from.some((f) => person.emails.includes(f)) ? 'FROM' : 'TO',
        })),
      },
    },
  })
  return true
}

function eventTime(time?: { dateTime?: string; date?: string }) {
  return time?.dateTime ? new Date(time.dateTime) : time?.date ? new Date(`${time.date}T09:00:00`) : null
}

export async function syncMeeting(mailbox: Mailbox, event: CalendarEvent): Promise<'upserted' | 'deleted' | 'skipped'> {
  const existing = await prisma.activity.findFirst({ where: { source: 'CALENDAR', externalId: event.id } })
  const others = counterparties((event.attendees ?? []).filter((a) => !a.self && a.responseStatus !== 'declined').map((a) => a.email.toLowerCase()), mailbox)
  const people = event.status === 'cancelled' ? [] : await peopleFor(others)
  if (!people.length) {
    if (existing) {
      await prisma.activity.delete({ where: { id: existing.id } })
      return 'deleted'
    }
    return 'skipped'
  }
  const start = eventTime(event.start)
  if (!start) return 'skipped'
  const deal = await dealFor(people)
  const data = {
    type: 'MEETING' as const,
    occurredAt: start,
    endsAt: eventTime(event.end),
    subject: event.summary ?? 'Meeting',
    body: [event.description?.replace(/<[^>]+>/g, ' ').slice(0, 1000), event.location ? `Where: ${event.location}` : null].filter(Boolean).join('\n\n') || null,
    url: event.hangoutLink ?? event.htmlLink ?? null,
    companyId: people.find((p) => p.companyId)?.companyId ?? deal?.companyId ?? null,
  }
  if (existing) {
    await prisma.activity.update({
      where: { id: existing.id },
      data: { ...data, ...(existing.manuallyLinked ? {} : { dealId: deal?.id ?? null }), participants: { deleteMany: {}, create: people.map((p) => ({ personId: p.id, role: 'ATTENDEE' as const, handle: p.emails[0] })) } },
    })
  } else {
    await prisma.activity.create({
      data: {
        ...data,
        dealId: deal?.id ?? null,
        source: 'CALENDAR',
        externalId: event.id,
        createdBy: 'SYNC',
        participants: { create: people.map((p) => ({ personId: p.id, role: 'ATTENDEE' as const, handle: p.emails[0] })) },
      },
    })
  }
  return 'upserted'
}

/** Calendar step of the cron run, for every mailbox that syncs contacts. */
async function syncCalendars() {
  const stats = { meetings: 0, calendarErrors: 0 }
  const mailboxes = await prisma.mailbox.findMany({ where: { active: true, syncContacts: true, authFailedAt: null } })
  for (const mailbox of mailboxes) {
    // Mailboxes connected before the calendar scope existed need a reconnect.
    if (!mailbox.scopes.some((s) => s.includes('calendar'))) continue
    try {
      const { events, nextSyncToken } = await calendarChanges(mailbox.id, mailbox.calendarSyncToken)
      for (const event of events) if ((await syncMeeting(mailbox, event)) === 'upserted') stats.meetings++
      await prisma.mailbox.update({ where: { id: mailbox.id }, data: { calendarSyncToken: nextSyncToken, calendarSyncedAt: new Date() } })
    } catch (error) {
      stats.calendarErrors++
      // Expired token: a full sync next time.
      if (error instanceof GmailError && error.status === 410) await prisma.mailbox.update({ where: { id: mailbox.id }, data: { calendarSyncToken: null } })
    }
  }
  return stats
}

/** A draft or deleted message can be gone by the time the run reads it; it must not hold the cursor back. */
async function messageIfStillThere(mailboxId: string, id: string) {
  try {
    return await messageMeta(mailboxId, id)
  } catch (error) {
    if (error instanceof GmailError && error.status === 404) return null
    throw error
  }
}

/** Reads what the mailbox received and sent since its cursor, and returns how many emails were logged. */
async function syncMailboxEmails(mailbox: Mailbox) {
  // First run: start from now, older mail is not imported.
  if (!mailbox.historyId) {
    await prisma.mailbox.update({ where: { id: mailbox.id }, data: { historyId: await currentHistoryId(mailbox.id) } })
    return 0
  }
  let page
  try {
    page = await messagesSince(mailbox.id, mailbox.historyId)
  } catch (error) {
    // Cursor older than Gmail keeps (about a week): restart from now.
    if (error instanceof GmailError && error.status === 404) {
      await prisma.mailbox.update({ where: { id: mailbox.id }, data: { historyId: await currentHistoryId(mailbox.id), lastError: 'History cursor expired, restarted' } })
      return 0
    }
    throw error
  }
  let logged = 0
  for (const added of page.added) {
    const meta = await messageIfStillThere(mailbox.id, added.id)
    if (meta && (await syncEmail(mailbox, meta))) logged++
  }
  await prisma.mailbox.update({ where: { id: mailbox.id }, data: { historyId: page.historyId, lastError: null } })
  return logged
}

/** Gmail step of the cron run, for every mailbox that syncs contacts. */
export async function syncEmails() {
  const stats = { emailsLogged: 0, mailboxErrors: 0 }
  const mailboxes = await prisma.mailbox.findMany({ where: { active: true, syncContacts: true, authFailedAt: null } })
  for (const mailbox of mailboxes) {
    try {
      stats.emailsLogged += await syncMailboxEmails(mailbox)
    } catch (error) {
      stats.mailboxErrors++
      if (!(error instanceof GoogleAuthError)) {
        await prisma.mailbox.update({ where: { id: mailbox.id }, data: { lastError: String(error instanceof Error ? error.message : error).slice(0, 500) } })
      }
    }
  }
  return stats
}

/** The cron run: Gmail, then Calendar. A workspace with no working client just waits: no mailbox of its is at fault. */
export async function runSync() {
  if (!(await googleClient())) return { emailsLogged: 0, mailboxErrors: 0, meetings: 0, calendarErrors: 0 }
  return { ...(await syncEmails()), ...(await syncCalendars()) }
}
