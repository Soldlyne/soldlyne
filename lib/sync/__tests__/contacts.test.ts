import { beforeAll, describe, expect, it } from 'vitest'
import type { Mailbox } from '@prisma/client'
import { createStages, workspaceForFile } from '@/test/fixtures'

const { prisma } = await import('@/lib/prisma')
const { addressesOf, isBulk, syncEmail, syncMeeting } = await import('../contacts')

const tag = `sync-${Date.now()}`
let mailbox: Mailbox
let personId = ''
let dealId = ''

const meta = (over: Partial<{ id: string; from: string; to: string; labels: string[]; extra: Record<string, string> }>) => ({
  id: over.id ?? `m-${tag}`,
  threadId: `t-${tag}`,
  snippet: 'Bonjour, merci pour votre message',
  internalDate: Date.now(),
  labelIds: over.labels ?? ['INBOX'],
  headers: { from: over.from ?? `Camille <camille@${tag}.example>`, to: over.to ?? `me@out-${tag}.example`, subject: 'Projet', ...over.extra },
})

const workspace = workspaceForFile(tag)

beforeAll(() =>
  workspace.run(async () => {
    mailbox = await prisma.mailbox.create({ data: { email: `me@out-${tag}.example`, displayName: 'Me', refreshToken: 'x' } })
    const company = await prisma.company.create({ data: { name: `Acme ${tag}`, domain: `${tag}.example` } })
    personId = (await prisma.person.create({ data: { firstName: 'Camille', lastName: 'X', emails: [`camille@${tag}.example`], companyId: company.id } })).id
    const { open: stage } = await createStages(tag)
    const product = await prisma.product.create({ data: { name: `P ${tag}` } })
    dealId = (await prisma.deal.create({ data: { name: 'D', productId: product.id, stageId: stage.id, companyId: company.id, contactId: personId } })).id
  }),
)

describe('contact sync', () => {
  it('parses address headers', () => {
    expect(addressesOf('Jane Doe <Jane@Acme.fr>, bob@x.io')).toEqual(['jane@acme.fr', 'bob@x.io'])
  })

  it('skips bulk and automated mail', () => {
    expect(isBulk({ labelIds: ['INBOX'], headers: { 'list-unsubscribe': '<mailto:x>' } })).toBe(true)
    expect(isBulk({ labelIds: ['CATEGORY_PROMOTIONS'], headers: {} })).toBe(true)
    expect(isBulk({ labelIds: ['INBOX'], headers: { from: 'noreply@saas.io' } })).toBe(true)
    expect(isBulk({ labelIds: ['INBOX'], headers: { from: 'camille@acme.fr' } })).toBe(false)
  })

  workspace.it('logs an email with a known contact on the deal, once', async () => {
    expect(await syncEmail(mailbox, meta({}))).toBe(true)
    expect(await syncEmail(mailbox, meta({}))).toBe(false)
    const activity = await prisma.activity.findFirstOrThrow({ where: { externalId: `m-${tag}` }, include: { participants: true } })
    expect(activity.direction).toBe('INBOUND')
    expect(activity.dealId).toBe(dealId)
    expect(activity.participants[0].role).toBe('FROM')
  })

  workspace.it('ignores emails with unknown people and colleagues', async () => {
    expect(await syncEmail(mailbox, meta({ id: `m2-${tag}`, from: 'stranger@nowhere.example' }))).toBe(false)
    expect(await syncEmail(mailbox, meta({ id: `m3-${tag}`, from: `colleague@out-${tag}.example` }))).toBe(false)
  })

  workspace.it('logs outbound mail from the mailbox', async () => {
    expect(await syncEmail(mailbox, meta({ id: `m4-${tag}`, from: mailbox.email, to: `camille@${tag}.example`, labels: ['SENT'] }))).toBe(true)
    expect((await prisma.activity.findFirstOrThrow({ where: { externalId: `m4-${tag}` } })).direction).toBe('OUTBOUND')
  })

  workspace.it('upserts a meeting with a contact and removes it when cancelled', async () => {
    const event = {
      id: `ev-${tag}`,
      status: 'confirmed' as const,
      summary: 'Discovery call',
      start: { dateTime: '2026-10-15T09:00:00+02:00' },
      end: { dateTime: '2026-10-15T09:30:00+02:00' },
      attendees: [{ email: mailbox.email, self: true }, { email: `camille@${tag}.example` }],
    }
    expect(await syncMeeting(mailbox, event)).toBe('upserted')
    expect(await syncMeeting(mailbox, { ...event, summary: 'Discovery call (moved)' })).toBe('upserted')
    const meetings = await prisma.activity.findMany({ where: { externalId: `ev-${tag}` } })
    expect(meetings).toHaveLength(1)
    expect(meetings[0].subject).toBe('Discovery call (moved)')
    expect(meetings[0].dealId).toBe(dealId)
    expect(await syncMeeting(mailbox, { ...event, status: 'cancelled' })).toBe('deleted')
  })
})
