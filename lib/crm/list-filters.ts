import type { Prisma } from '@prisma/client'

/**
 * List filters read from the URL (?priority=A&contact=30d...). The same query
 * string is what a saved view stores, so a view is just a bookmark.
 */

export type Params = Record<string, string | string[] | undefined>

export function param(params: Params, key: string): string | undefined {
  const value = params[key]
  const first = Array.isArray(value) ? value[0] : value
  return first || undefined
}

const DAY = 86_400_000
const contains = (q: string) => ({ contains: q, mode: 'insensitive' as const })

/** "never" | "7d" (contacted within) | "30d+" (not contacted for 30 days or more). */
function contactFilter(value: string | undefined, now: Date): Prisma.ActivityListRelationFilter | undefined {
  if (!value) return undefined
  if (value === 'never') return { none: {} }
  const days = Number.parseInt(value, 10)
  if (!days) return undefined
  const since = new Date(now.getTime() - days * DAY)
  return value.endsWith('+') ? { none: { occurredAt: { gte: since } } } : { some: { occurredAt: { gte: since } } }
}

export function companyWhere(params: Params, now = new Date()): Prisma.CompanyWhereInput {
  const where: Prisma.CompanyWhereInput = { deletedAt: null }
  const and: Prisma.CompanyWhereInput[] = []
  const q = param(params, 'q')
  if (q) and.push({ OR: [{ name: contains(q) }, { domain: contains(q) }, { city: contains(q) }, { industry: contains(q) }] })
  const priority = param(params, 'priority')
  if (priority === 'none') and.push({ priority: null })
  else if (priority) and.push({ priority })
  const people = param(params, 'people')
  if (people === 'none') and.push({ people: { none: { deletedAt: null } } })
  if (people === 'some') and.push({ people: { some: { deletedAt: null } } })
  const project = param(params, 'project')
  if (project) and.push({ deals: { some: { deletedAt: null, stage: { kind: 'OPEN' }, product: { projectId: project } } } })
  const deal = param(params, 'deal')
  if (deal === 'open') and.push({ deals: { some: { deletedAt: null, stage: { kind: 'OPEN' } } } })
  if (deal === 'none') and.push({ deals: { none: { deletedAt: null } } })
  if (deal === 'won') and.push({ deals: { some: { deletedAt: null, stage: { kind: 'WON' } } } })
  const contact = contactFilter(param(params, 'contact'), now)
  if (contact) and.push({ activities: contact })
  if (and.length) where.AND = and
  return where
}

export function personWhere(params: Params, now = new Date()): Prisma.PersonWhereInput {
  const where: Prisma.PersonWhereInput = { deletedAt: null }
  const and: Prisma.PersonWhereInput[] = []
  const q = param(params, 'q')
  if (q) {
    and.push({ OR: [{ firstName: contains(q) }, { lastName: contains(q) }, { jobTitle: contains(q) }, { emails: { has: q.toLowerCase() } }, { company: { name: contains(q) } }] })
  }
  const email = param(params, 'email')
  if (email === 'yes') and.push({ emails: { isEmpty: false } })
  if (email === 'no') and.push({ emails: { isEmpty: true } })
  const optin = param(params, 'optin')
  if (optin === 'yes') and.push({ consentAt: { not: null } })
  if (optin === 'no') and.push({ consentAt: null })
  const priority = param(params, 'priority')
  if (priority) and.push({ company: { priority } })
  const project = param(params, 'project')
  if (project) {
    const open = { deletedAt: null, stage: { kind: 'OPEN' as const }, product: { projectId: project } }
    and.push({ OR: [{ contactFor: { some: open } }, { company: { deals: { some: open } } }] })
  }
  const contact = param(params, 'contact')
  if (contact === 'never') and.push({ participants: { none: {} } })
  else if (contact) {
    const days = Number.parseInt(contact, 10)
    const since = new Date(now.getTime() - days * DAY)
    and.push(contact.endsWith('+') ? { participants: { none: { activity: { occurredAt: { gte: since } } } } } : { participants: { some: { activity: { occurredAt: { gte: since } } } } })
  }
  if (and.length) where.AND = and
  return where
}

export function dealWhere(params: Params, now = new Date()): Prisma.DealWhereInput {
  const where: Prisma.DealWhereInput = { deletedAt: null }
  const and: Prisma.DealWhereInput[] = []
  const q = param(params, 'q')
  if (q) and.push({ OR: [{ name: contains(q) }, { company: { name: contains(q) } }] })
  const project = param(params, 'project')
  if (project) and.push({ product: { projectId: project } })
  const product = param(params, 'product')
  if (product) and.push({ productId: product })
  const stage = param(params, 'stage')
  if (stage === 'open') and.push({ stage: { kind: 'OPEN' } })
  else if (stage === 'won') and.push({ stage: { kind: 'WON' } })
  else if (stage === 'lost') and.push({ stage: { kind: 'LOST' } })
  else if (stage) and.push({ stageId: stage })
  const next = param(params, 'next')
  const today = new Date(now)
  today.setHours(23, 59, 59, 999)
  if (next === 'none') and.push({ tasks: { none: { completedAt: null } } })
  if (next === 'due') and.push({ tasks: { some: { completedAt: null, dueAt: { lte: today } } } })
  if (param(params, 'stale') === 'yes') and.push({ stage: { kind: 'OPEN' }, stageEnteredAt: { lt: new Date(now.getTime() - 14 * DAY) } })
  const contact = contactFilter(param(params, 'contact'), now)
  if (contact) and.push({ activities: contact })
  if (param(params, 'nocontact') === 'yes') and.push({ contactId: null })
  if (and.length) where.AND = and
  return where
}

/** The filter part of a URL, without empty values, sorted: what a saved view stores. */
export function filterQuery(params: Params): string {
  const entries = Object.entries(params)
    .map(([key, value]) => [key, Array.isArray(value) ? value[0] : value] as const)
    .filter(([key, value]) => value && key !== 'view')
    .sort(([a], [b]) => a.localeCompare(b))
  return new URLSearchParams(entries as [string, string][]).toString()
}
