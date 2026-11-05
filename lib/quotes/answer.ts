import 'server-only'
import { revalidatePath } from 'next/cache'
import type { Prisma } from '@prisma/client'
import { currentActor, requireActor } from '@/lib/actor'
import { topPosition } from '@/lib/crm/deal-stage'
import { prisma, runInWorkspace } from '@/lib/prisma'
import { recordQuoteEvent } from './events'
import { findQuoteAtLink } from './link'
import { lockedStatus } from './quotes'
import { quoteDocument, type QuoteDocument } from './document'
import { quoteInclude } from './queries'
import { QuoteRefusal } from './refusal'
import { stateOf, todayUtc, type QuoteState } from './status'

const LONGEST_NAME = 200
const LONGEST_REASON = 2000
const LONGEST_USER_AGENT = 500
const LONGEST_IP = 64

/** Nothing here says what the link was for: whoever holds a dead link may be anyone. */
export const LINK_UNKNOWN = "This link isn't valid, or a newer one has replaced it. Ask whoever sent you the quote for a new link."

const REFUSALS: Partial<Record<QuoteState, string>> = {
  ACCEPTED: 'This quote has already been accepted.',
  DECLINED: 'This quote has already been declined.',
  EXPIRED: 'This quote has expired. Ask whoever sent it for a new one.',
}

export type Answered = { ok: true } | { ok: false; error: string }

const refused = (error: string): Answered => ({ ok: false, error })

export type SeenAtLink = { found: false } | { found: true; document: QuoteDocument }

/** What a customer's link shows. Reading never changes anything: mail scanners open links too. */
export async function seeQuoteAtLink(token: string): Promise<SeenAtLink> {
  const link = await findQuoteAtLink(token)
  if (!link) return { found: false }
  const quote = await runInWorkspace(link.workspaceId, () => prisma.quote.findUnique({ where: { id: link.id }, include: quoteInclude }))
  return quote ? { found: true, document: quoteDocument(quote, null) } : { found: false }
}

type Tx = Prisma.TransactionClient

/** Moves the deal to the workspace's first Won stage. A deal already closed, deleted or gone stays as it is, and so does one in a workspace with no Won stage. */
async function winDeal(tx: Tx, dealId: string | null) {
  const deal = dealId ? await tx.deal.findUnique({ where: { id: dealId }, include: { stage: true } }) : null
  if (!deal || deal.deletedAt || deal.stage.kind !== 'OPEN') return
  const won = await tx.stage.findFirst({ where: { kind: 'WON' }, orderBy: { position: 'asc' } })
  if (!won) return
  const now = new Date()
  await tx.deal.update({ where: { id: deal.id }, data: { stageId: won.id, stageEnteredAt: now, closedAt: now, position: await topPosition(tx, won.id, deal.productId) } })
  await tx.timelineEvent.create({ data: { name: 'deal.stage_changed', properties: { from: deal.stage.name, to: won.name }, actor: 'SYSTEM', dealId: deal.id, companyId: deal.companyId } })
}

/** The refusal for a quote that couldn't take an answer, read once it has lost the race for one. */
async function refusalOf(tx: Tx, id: string): Promise<Answered> {
  const quote = await tx.quote.findUniqueOrThrow({ where: { id }, select: { status: true, validUntil: true } })
  return refused(REFUSALS[stateOf(quote)] ?? LINK_UNKNOWN)
}

export type Acceptance = { name: string; confirmed: boolean }
export type Client = { ip: string | null; userAgent: string | null }

/** The customer's yes, once: claiming the row is what stops two at once. The quote, the deal and their timelines change together or not at all. */
export async function acceptQuoteAtLink(token: string, { name, confirmed }: Acceptance, { ip, userAgent }: Client): Promise<Answered> {
  const typed = name.trim().slice(0, LONGEST_NAME)
  if (!typed) return refused('Type your name to accept.')
  if (!confirmed) return refused('Tick the box to confirm.')
  const link = await findQuoteAtLink(token)
  if (!link) return refused(LINK_UNKNOWN)
  return runInWorkspace(link.workspaceId, () =>
    prisma.$transaction(async (tx) => {
      const now = new Date()
      const data = { status: 'ACCEPTED' as const, acceptedName: typed, acceptedAt: now, acceptedIp: ip?.slice(0, LONGEST_IP) ?? null, acceptedUserAgent: userAgent?.slice(0, LONGEST_USER_AGENT) ?? null }
      const { count } = await tx.quote.updateMany({ where: { id: link.id, status: 'SENT', validUntil: { gte: todayUtc(now) } }, data })
      if (count === 0) return refusalOf(tx, link.id)
      const quote = await tx.quote.findUniqueOrThrow({ where: { id: link.id } })
      await recordQuoteEvent(tx, 'quote.accepted', quote, { reference: quote.reference, by: typed }, 'SYSTEM')
      await winDeal(tx, quote.dealId)
      return { ok: true as const }
    }),
  )
}

const cleanReason = (reason: string | null | undefined) => reason?.trim().slice(0, LONGEST_REASON) || null

/** The customer's no, once, while the quote is still good. It says so on the timeline and leaves the deal where it is: one quote declined isn't the deal lost. */
export async function declineQuoteAtLink(token: string, reason: string | null): Promise<Answered> {
  const link = await findQuoteAtLink(token)
  if (!link) return refused(LINK_UNKNOWN)
  const declineReason = cleanReason(reason)
  return runInWorkspace(link.workspaceId, () =>
    prisma.$transaction(async (tx) => {
      const { count } = await tx.quote.updateMany({ where: { id: link.id, status: 'SENT', validUntil: { gte: todayUtc() } }, data: { status: 'DECLINED', declinedAt: new Date(), declineReason } })
      if (count === 0) return refusalOf(tx, link.id)
      const quote = await tx.quote.findUniqueOrThrow({ where: { id: link.id } })
      await recordQuoteEvent(tx, 'quote.declined', quote, { reference: quote.reference, reason: declineReason }, 'SYSTEM')
      return { ok: true as const }
    }),
  )
}

/** A member recording a no they got some other way, on a sent quote, expired or not. */
export async function markQuoteDeclined(id: string, reason: string | null): Promise<void> {
  await requireActor()
  const declineReason = cleanReason(reason)
  const actor = currentActor()
  await prisma.$transaction(async (tx) => {
    if ((await lockedStatus(tx, id)) !== 'SENT') throw new QuoteRefusal('Only a sent quote can be marked declined.')
    const quote = await tx.quote.update({ where: { id }, data: { status: 'DECLINED', declinedAt: new Date(), declineReason } })
    await recordQuoteEvent(tx, 'quote.declined', quote, { reference: quote.reference, reason: declineReason }, actor)
  })
  revalidatePath('/', 'layout')
}
