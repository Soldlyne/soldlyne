import 'server-only'
import type { Prisma } from '@prisma/client'
import { isFreeMail } from '@/lib/crm/format'
import { prisma } from '@/lib/prisma'
import { pageOf, type ListQuery } from './reads'

/**
 * Who a prospecting tool must leave alone: the customers and open deals of this workspace, by what
 * identifies them and nothing of the deals themselves. A customer is a company with a won deal. Read
 * whole each time: what identifies someone can change without their deal changing.
 */

const SOMEONE = { emails: true, phones: true, linkedinUrl: true } satisfies Prisma.PersonSelect

const ENTRY_READ = {
  stage: { select: { kind: true } },
  contact: { select: { ...SOMEONE, deletedAt: true } },
  company: { select: { name: true, domain: true, custom: true, people: { where: { deletedAt: null }, select: SOMEONE } } },
} satisfies Prisma.DealInclude

type EntryRow = Prisma.DealGetPayload<{ include: typeof ENTRY_READ }>
type Someone = Prisma.PersonGetPayload<{ select: typeof SOMEONE }>

/** Where a SIREN is kept: a company has no column for it, and one handed over brings it in its custom fields. */
const sirenIn = (custom: Prisma.JsonValue) => {
  const siren = (custom as { siren?: unknown } | null)?.siren
  return typeof siren === 'string' ? siren : null
}

const identifying = ({ emails, phones, linkedinUrl }: Someone) => ({ emails, phones, linkedinUrl })

function showEntry({ stage, contact, company }: EntryRow) {
  const named = contact && !contact.deletedAt ? [contact] : []
  return {
    why: stage.kind === 'WON' ? 'customer' : 'open_deal',
    // A provider's domain would stop everyone there, for one customer who happens to use it.
    company: company && { name: company.name, domain: company.domain && !isFreeMail(company.domain) ? company.domain : null, siren: sirenIn(company.custom) },
    people: [...named, ...(company?.people ?? [])].map(identifying),
  }
}

export const readDoNotProspect = (query: ListQuery) =>
  pageOf(query, ({ where, ...page }) => prisma.deal.findMany({ ...page, include: ENTRY_READ, where: { ...where, deletedAt: null, stage: { kind: { in: ['OPEN', 'WON'] } } } }), showEntry)
