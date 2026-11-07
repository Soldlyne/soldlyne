import 'server-only'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { dealUrl } from '@/lib/api/reads'
import { topPosition } from '@/lib/crm/deal-stage'
import { CHANNELS, isFreeMail, normalizeDomain, normalizeEmail } from '@/lib/crm/format'
import { prisma } from '@/lib/prisma'

/**
 * Someone a tool hands over: a person and a deal, and the company they're at, found again rather than
 * made twice. It adds to what's here and never overwrites a member's words, doesn't reopen a closed
 * deal, and contacts nobody: nothing here sends anything. What a member deleted stays deleted: someone
 * deleted is refused, a company deleted is left where it is, and a repeat brings neither back.
 */

/** What a tool asks to learn that this install keeps deleted people deleted and takes a person with no company: older ones restore them. */
export const HANDOVER_VERSION = 2

export const handoverSchema = z.object({
  company: z
    .object({
      name: z.string().trim().min(1).max(200),
      website: z.string().trim().max(300).optional(),
      siren: z.string().regex(/^\d{9}$/).optional(),
    })
    .optional(),
  person: z
    .object({
      firstName: z.string().trim().max(100).optional(),
      lastName: z.string().trim().min(1).max(100).optional(),
      email: z.string().trim().email().max(320).transform(normalizeEmail).optional(),
      phone: z.string().trim().max(50).optional(),
      jobTitle: z.string().trim().max(200).optional(),
    })
    .refine(({ email, lastName }) => Boolean(email || lastName), 'needs an address or a last name'),
  /** What happened, in the tool's words: kept once on the deal. */
  note: z.string().trim().max(5000).optional(),
  /** What keeps a retry of one event to one note, whatever its words. Without it, the same words on the same deal are the repeat. */
  retryKey: z.string().trim().min(1).max(200).optional(),
  source: z.enum(CHANNELS).default('OTHER'),
})

export type Handover = z.output<typeof handoverSchema>

export class NoOpenStageError extends Error {
  constructor() {
    super('This workspace has no open stage to put a deal in.')
    this.name = 'NoOpenStageError'
  }
}

/** Someone a member deleted: nothing is written, and they stay deleted. What the tool does next is leave them alone. */
export class PersonDeletedError extends Error {
  constructor() {
    super('person_deleted')
    this.name = 'PersonDeletedError'
  }
}

type Tx = Prisma.TransactionClient
type GivenCompany = NonNullable<Handover['company']>
type LiveCompany = { id: string; name: string }

/** The site's domain, else the address's, unless that's a mail provider's, which says nothing of the company. */
function companyDomain({ company, person }: Handover): string | null {
  const domain = normalizeDomain(company?.website) ?? normalizeDomain(person.email)
  return domain && !isFreeMail(domain) ? domain : null
}

/** Only live ones: a company a member deleted isn't found, restored or attached to. */
async function findCompany(tx: Tx, { name, siren }: GivenCompany, domain: string | null) {
  const bySiren = siren ? await tx.company.findFirst({ where: { deletedAt: null, custom: { path: ['siren'], equals: siren } } }) : null
  if (bySiren) return bySiren
  const byDomain = domain ? await tx.company.findFirst({ where: { domain, deletedAt: null } }) : null
  return byDomain ?? tx.company.findFirst({ where: { deletedAt: null, name: { equals: name, mode: 'insensitive' } } })
}

/** The domain, unless another company holds it. One deleted holds it still, since it can only be held once, and keeps it for if a member brings it back. */
async function unheldDomain(tx: Tx, domain: string | null): Promise<string | null> {
  return domain && !(await tx.company.findFirst({ where: { domain }, select: { id: true } })) ? domain : null
}

async function makeCompany(tx: Tx, { name, siren }: GivenCompany, domain: string | null, source: Handover['source']) {
  const made = await tx.company.create({ data: { name, domain: await unheldDomain(tx, domain), custom: siren ? { siren } : {}, source, createdBy: 'SYNC' } })
  await tx.timelineEvent.create({ data: { name: 'company.created', actor: 'SYNC', companyId: made.id } })
  return made
}

/** Gives a company found what it lacks, and writes nothing when it lacks nothing. */
async function completeCompany<T extends { id: string; domain: string | null; custom: Prisma.JsonValue }>(tx: Tx, found: T, { siren }: GivenCompany, domain: string | null) {
  const newDomain = found.domain ? null : await unheldDomain(tx, domain)
  const custom = siren && !(found.custom as { siren?: unknown }).siren ? { ...(found.custom as object), siren } : null
  if (!newDomain && !custom) return found
  return tx.company.update({ where: { id: found.id }, data: { ...(newDomain ? { domain: newDomain } : {}), ...(custom ? { custom } : {}) } })
}

/** The company named, found or made. With none named, the one the address says, if it's live: someone who booked a meeting never makes one, and nothing is invented for them. */
async function companyFor(tx: Tx, given: Handover) {
  const domain = companyDomain(given)
  if (!given.company) return domain ? tx.company.findFirst({ where: { domain, deletedAt: null } }) : null
  const found = await findCompany(tx, given.company, domain)
  return found ? completeCompany(tx, found, given.company, domain) : makeCompany(tx, given.company, domain, given.source)
}

/** Whoever holds the address, or that name at that company, the live one first. Someone deleted is found too, since that's what refuses them. */
const LIVE_FIRST = { deletedAt: { sort: 'asc', nulls: 'first' } } satisfies Prisma.PersonOrderByWithRelationInput

async function findPerson(tx: Tx, { firstName, lastName, email }: Handover['person'], companyId: string | null) {
  const byEmail = email ? await tx.person.findFirst({ where: { emails: { has: email } }, orderBy: LIVE_FIRST }) : null
  if (byEmail || !companyId || !lastName) return byEmail
  return tx.person.findFirst({ where: { companyId, firstName: { equals: firstName ?? '', mode: 'insensitive' }, lastName: { equals: lastName, mode: 'insensitive' } }, orderBy: LIVE_FIRST })
}

const including = (list: string[], value: string | undefined) => (value && !list.includes(value) ? [...list, value] : list)

/** Finds the person or makes them. One found keeps what a member wrote, and gets what they lack. Someone deleted is refused: thrown in the transaction, so what came before it is undone. */
async function personFor(tx: Tx, given: Handover, companyId: string | null) {
  const { firstName, lastName, email, phone, jobTitle } = given.person
  const found = await findPerson(tx, given.person, companyId)
  if (found?.deletedAt) throw new PersonDeletedError()
  if (!found) {
    const made = await tx.person.create({ data: { firstName: firstName ?? '', lastName: lastName ?? '', emails: email ? [email] : [], phones: phone ? [phone] : [], jobTitle, companyId, source: given.source, createdBy: 'SYNC' } })
    await tx.timelineEvent.create({ data: { name: 'person.created', actor: 'SYNC', personId: made.id, companyId } })
    return made
  }
  return tx.person.update({
    where: { id: found.id },
    data: { firstName: found.firstName || firstName, lastName: found.lastName || lastName, jobTitle: found.jobTitle ?? jobTitle, emails: including(found.emails, email), phones: including(found.phones, phone), companyId: found.companyId ?? companyId },
  })
}

/** The company this goes on: the one named, else the one they're already at, unless a member deleted it. */
async function companyOfDeal(tx: Tx, named: LiveCompany | null, person: { companyId: string | null }): Promise<LiveCompany | null> {
  if (named || !person.companyId) return named
  return tx.company.findFirst({ where: { id: person.companyId, deletedAt: null }, select: { id: true, name: true } })
}

/** What they're called, or their address. Nothing is invented for someone who gave neither name. */
const whoIs = ({ firstName, lastName, emails }: { firstName: string; lastName: string; emails: string[] }) => [firstName, lastName].filter(Boolean).join(' ') || emails[0]

/** The deal on this product for this person or their company: the open one first. A closed one is a member's to reopen, so it's only found. */
async function dealFor(tx: Tx, productId: string, company: LiveCompany | null, person: Parameters<typeof whoIs>[0] & { id: string }, source: Handover['source']) {
  const deals = await tx.deal.findMany({ where: { productId, deletedAt: null, OR: [{ contactId: person.id }, ...(company ? [{ companyId: company.id }] : [])] }, include: { stage: { select: { kind: true } } }, orderBy: { createdAt: 'desc' } })
  const found = deals.find(({ stage }) => stage.kind === 'OPEN') ?? deals[0]
  if (found) return { deal: found, created: false }
  const stage = await tx.stage.findFirst({ where: { kind: 'OPEN' }, orderBy: { position: 'asc' } })
  if (!stage) throw new NoOpenStageError()
  const deal = await tx.deal.create({ data: { name: company?.name ?? whoIs(person), productId, stageId: stage.id, companyId: company?.id ?? null, contactId: person.id, source, createdBy: 'SYNC', position: await topPosition(tx, stage.id, productId) } })
  await tx.timelineEvent.create({ data: { name: 'deal.created', actor: 'SYNC', dealId: deal.id, companyId: company?.id ?? null } })
  return { deal, created: true }
}

/** Says whether this added the note. A retry key says what a repeat is; without one, it's the same words on the same deal. */
async function noteOnce(tx: Tx, { note, retryKey }: Pick<Handover, 'note' | 'retryKey'>, on: { dealId: string; personId: string; companyId: string | null }): Promise<boolean> {
  if (!note || (await tx.note.findFirst({ where: retryKey ? { retryKey } : { dealId: on.dealId, body: note }, select: { id: true } }))) return false
  await tx.note.create({ data: { body: note, retryKey, ...on, createdBy: 'SYNC' } })
  return true
}

/**
 * The whole handover, as one. Handovers of a workspace wait for each other: two arriving together
 * for one person would each look, find nothing, and make the same deal twice.
 */
export async function handOver(productId: string, given: Handover) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('handover:' || current_setting('app.workspace_id')))`
    const named = await companyFor(tx, given)
    const person = await personFor(tx, given, named?.id ?? null)
    const company = await companyOfDeal(tx, named, person)
    const { deal, created } = await dealFor(tx, productId, company, person, given.source)
    const on = { dealId: deal.id, personId: person.id, companyId: company?.id ?? null }
    const noted = await noteOnce(tx, given, on)
    // Something new means someone has to answer: every open deal should have a next step.
    if (created || noted) await tx.task.create({ data: { title: `Follow up: ${whoIs(person)}`, dueAt: new Date(), ...on, createdBy: 'SYNC' } })
    return { ...on, created, url: dealUrl(deal.id) }
  })
}
