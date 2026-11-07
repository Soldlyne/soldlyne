import 'server-only'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { dealUrl } from '@/lib/api/reads'
import { topPosition } from '@/lib/crm/deal-stage'
import { CHANNELS, isFreeMail, normalizeDomain, normalizeEmail } from '@/lib/crm/format'
import { prisma } from '@/lib/prisma'

/**
 * Someone a prospecting tool hands over: a company, a person and a deal, found again rather than made
 * twice. It adds to what's here and never overwrites a member's words, doesn't reopen a closed deal,
 * and contacts nobody: nothing here sends anything.
 */

export const handoverSchema = z.object({
  company: z.object({
    name: z.string().trim().min(1).max(200),
    website: z.string().trim().max(300).optional(),
    siren: z.string().regex(/^\d{9}$/).optional(),
  }),
  person: z.object({
    firstName: z.string().trim().max(100).optional(),
    lastName: z.string().trim().min(1).max(100),
    email: z.string().trim().email().max(320).transform(normalizeEmail).optional(),
    phone: z.string().trim().max(50).optional(),
    jobTitle: z.string().trim().max(200).optional(),
  }),
  /** What happened, in the tool's words: kept once on the deal. */
  note: z.string().trim().max(5000).optional(),
  source: z.enum(CHANNELS).default('OTHER'),
})

export type Handover = z.output<typeof handoverSchema>

export class NoOpenStageError extends Error {
  constructor() {
    super('This workspace has no open stage to put a deal in.')
    this.name = 'NoOpenStageError'
  }
}

type Tx = Prisma.TransactionClient

/** The site's domain, else the address's, unless that's a mail provider's, which says nothing of the company. */
function companyDomain({ company, person }: Handover): string | null {
  const domain = normalizeDomain(company.website) ?? normalizeDomain(person.email)
  return domain && !isFreeMail(domain) ? domain : null
}

async function findCompany(tx: Tx, { name, siren }: Handover['company'], domain: string | null) {
  const bySiren = siren ? await tx.company.findFirst({ where: { deletedAt: null, custom: { path: ['siren'], equals: siren } } }) : null
  if (bySiren) return bySiren
  const byDomain = domain ? await tx.company.findFirst({ where: { domain } }) : null
  return byDomain ?? tx.company.findFirst({ where: { deletedAt: null, name: { equals: name, mode: 'insensitive' } } })
}

/** Finds the company or makes it. One found gets what it lacks, and comes back if it was deleted, since its domain can only be held once. */
async function companyFor(tx: Tx, given: Handover) {
  const domain = companyDomain(given)
  const { name, siren } = given.company
  const found = await findCompany(tx, given.company, domain)
  if (!found) {
    const made = await tx.company.create({ data: { name, domain, custom: siren ? { siren } : {}, source: given.source, createdBy: 'SYNC' } })
    await tx.timelineEvent.create({ data: { name: 'company.created', actor: 'SYNC', companyId: made.id } })
    return made
  }
  const domainFree = domain && !found.domain && !(await tx.company.findFirst({ where: { domain }, select: { id: true } }))
  const custom = siren && !(found.custom as { siren?: unknown }).siren ? { ...(found.custom as object), siren } : undefined
  return tx.company.update({ where: { id: found.id }, data: { deletedAt: null, ...(domainFree ? { domain } : {}), ...(custom ? { custom } : {}) } })
}

async function findPerson(tx: Tx, { firstName, lastName, email }: Handover['person'], companyId: string) {
  const byEmail = email ? await tx.person.findFirst({ where: { emails: { has: email } } }) : null
  return byEmail ?? tx.person.findFirst({ where: { companyId, deletedAt: null, firstName: { equals: firstName ?? '', mode: 'insensitive' }, lastName: { equals: lastName, mode: 'insensitive' } } })
}

const including = (list: string[], value: string | undefined) => (value && !list.includes(value) ? [...list, value] : list)

/** Finds the person or makes them. One found keeps what a member wrote, and gets what they lack. */
async function personFor(tx: Tx, given: Handover, companyId: string) {
  const { firstName, lastName, email, phone, jobTitle } = given.person
  const found = await findPerson(tx, given.person, companyId)
  if (!found) {
    const made = await tx.person.create({ data: { firstName: firstName ?? '', lastName, emails: email ? [email] : [], phones: phone ? [phone] : [], jobTitle, companyId, source: given.source, createdBy: 'SYNC' } })
    await tx.timelineEvent.create({ data: { name: 'person.created', actor: 'SYNC', personId: made.id, companyId } })
    return made
  }
  return tx.person.update({
    where: { id: found.id },
    data: { deletedAt: null, firstName: found.firstName || firstName, lastName: found.lastName || lastName, jobTitle: found.jobTitle ?? jobTitle, emails: including(found.emails, email), phones: including(found.phones, phone), companyId: found.companyId ?? companyId },
  })
}

/** The deal on this product for this person or their company: the open one first. A closed one is a member's to reopen, so it's only found. */
async function dealFor(tx: Tx, productId: string, company: { id: string; name: string }, personId: string, source: Handover['source']) {
  const deals = await tx.deal.findMany({ where: { productId, deletedAt: null, OR: [{ contactId: personId }, { companyId: company.id }] }, include: { stage: { select: { kind: true } } }, orderBy: { createdAt: 'desc' } })
  const found = deals.find(({ stage }) => stage.kind === 'OPEN') ?? deals[0]
  if (found) return { deal: found, created: false }
  const stage = await tx.stage.findFirst({ where: { kind: 'OPEN' }, orderBy: { position: 'asc' } })
  if (!stage) throw new NoOpenStageError()
  const deal = await tx.deal.create({ data: { name: company.name, productId, stageId: stage.id, companyId: company.id, contactId: personId, source, createdBy: 'SYNC', position: await topPosition(tx, stage.id, productId) } })
  await tx.timelineEvent.create({ data: { name: 'deal.created', actor: 'SYNC', dealId: deal.id, companyId: company.id } })
  return { deal, created: true }
}

/** Says whether this added the note: the same words on the same deal are a repeat. */
async function noteOnce(tx: Tx, note: string | undefined, on: { dealId: string; personId: string; companyId: string }): Promise<boolean> {
  if (!note || (await tx.note.findFirst({ where: { dealId: on.dealId, body: note }, select: { id: true } }))) return false
  await tx.note.create({ data: { body: note, ...on, createdBy: 'SYNC' } })
  return true
}

/**
 * The whole handover, as one. Handovers of a workspace wait for each other: two arriving together
 * for one person would each look, find nothing, and make the same deal twice.
 */
export async function handOver(productId: string, given: Handover) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('handover:' || current_setting('app.workspace_id')))`
    const company = await companyFor(tx, given)
    const person = await personFor(tx, given, company.id)
    const { deal, created } = await dealFor(tx, productId, company, person.id, given.source)
    const on = { dealId: deal.id, personId: person.id, companyId: company.id }
    const noted = await noteOnce(tx, given.note, on)
    // Something new means someone has to answer: every open deal should have a next step.
    if (created || noted) await tx.task.create({ data: { title: `Follow up: ${[person.firstName, person.lastName].filter(Boolean).join(' ')}`, dueAt: new Date(), ...on, createdBy: 'SYNC' } })
    return { ...on, created, url: dealUrl(deal.id) }
  })
}
