import 'server-only'
import type { Prisma } from '@prisma/client'
import { personName } from '@/lib/crm/format'
import { prisma } from '@/lib/prisma'
import { publicUrl } from '@/lib/public-url'

/** What a list is asked for: where to resume, how many, and what changed since when. */
export type ListQuery = { cursor?: string; limit: number; updatedSince?: Date }

/** One page of a list. `asOf` is what to pass as `updatedSince` next time; keep the first page's. */
export type ListPage<T> = { data: T[]; nextCursor: string | null; asOf: string }

/**
 * How far `asOf` stays behind the clock. A record gets its date when it is written and shows once its
 * transaction commits, up to Prisma's 30 s timeout later: a read at that moment misses it, and the next one must still find it.
 */
const COMMIT_MARGIN_MS = 60_000

/** Reads a page in id order, which holds still while records change. One row more than asked says whether another page follows. */
export async function pageOf<Row extends { id: string }, T>(query: ListQuery, read: (args: { where: { id?: { gt: string } }; take: number; orderBy: { id: 'asc' } }) => Promise<Row[]>, show: (row: Row) => T): Promise<ListPage<T>> {
  const asOf = new Date(Date.now() - COMMIT_MARGIN_MS).toISOString()
  const rows = await read({ where: query.cursor ? { id: { gt: query.cursor } } : {}, take: query.limit + 1, orderBy: { id: 'asc' } })
  const shown = rows.slice(0, query.limit)
  return { data: shown.map(show), nextCursor: rows.length > query.limit ? shown[shown.length - 1].id : null, asOf }
}

const isoDay = (date: Date | null) => date?.toISOString().slice(0, 10) ?? null

/** A deal's page in the app, for whoever reads it elsewhere. */
export const dealUrl = (id: string) => `${publicUrl()}/deals/${id}`
const companyUrl = (id: string) => `${publicUrl()}/companies/${id}`

const DEAL_READ = {
  stage: { select: { id: true, name: true, kind: true, probability: true } },
  product: { select: { id: true, name: true, project: { select: { id: true, name: true } } } },
  contact: { select: { firstName: true, lastName: true, emails: true, deletedAt: true } },
} satisfies Prisma.DealInclude

type DealRow = Prisma.DealGetPayload<{ include: typeof DEAL_READ }>

function showDeal(deal: DealRow) {
  const contact = deal.contact && !deal.contact.deletedAt ? { name: personName(deal.contact), email: deal.contact.emails[0] ?? null } : null
  return {
    id: deal.id,
    name: deal.name,
    stage: { id: deal.stage.id, name: deal.stage.name, kind: deal.stage.kind },
    product: { id: deal.product.id, name: deal.product.name },
    project: deal.product.project,
    companyId: deal.companyId,
    contact,
    // A string: an amount in cents can outgrow what a JSON number holds exactly.
    amountMinor: deal.amount?.toString() ?? null,
    currency: deal.currency,
    // The deal's own, else its stage's: the one the weighted pipeline counts.
    probability: deal.probability ?? deal.stage.probability,
    closeDate: isoDay(deal.closeDate),
    closedAt: deal.closedAt?.toISOString() ?? null,
    source: deal.source,
    createdAt: deal.createdAt.toISOString(),
    updatedAt: deal.updatedAt.toISOString(),
    deleted: deal.deletedAt !== null,
    deletedAt: deal.deletedAt?.toISOString() ?? null,
    url: dealUrl(deal.id),
  }
}

/**
 * A deal shows its stage's, product's, project's and contact's names, so a change to any of them is a
 * change to the deal for whoever read it: renaming a stage, or turning it from open to won, has to reach them.
 */
const dealChangedSince = (since: Date): Prisma.DealWhereInput => ({
  OR: [{ updatedAt: { gte: since } }, { stage: { updatedAt: { gte: since } } }, { product: { updatedAt: { gte: since } } }, { product: { project: { updatedAt: { gte: since } } } }, { contact: { updatedAt: { gte: since } } }],
})

export const readDeals = (query: ListQuery) =>
  pageOf(query, ({ where, ...page }) => prisma.deal.findMany({ ...page, include: DEAL_READ, where: { ...where, ...(query.updatedSince ? dealChangedSince(query.updatedSince) : {}) } }), showDeal)

type CompanyRow = Prisma.CompanyGetPayload<object>

const showCompany = (company: CompanyRow) => ({
  id: company.id,
  name: company.name,
  domain: company.domain,
  industry: company.industry,
  size: company.size,
  city: company.city,
  country: company.country,
  createdAt: company.createdAt.toISOString(),
  updatedAt: company.updatedAt.toISOString(),
  deleted: company.deletedAt !== null,
  deletedAt: company.deletedAt?.toISOString() ?? null,
  url: companyUrl(company.id),
})

export const readCompanies = (query: ListQuery) =>
  pageOf(query, ({ where, ...page }) => prisma.company.findMany({ ...page, where: { ...where, ...(query.updatedSince ? { updatedAt: { gte: query.updatedSince } } : {}) } }), showCompany)

type StageRow = Prisma.StageGetPayload<object>

const showStage = (stage: StageRow) => ({ id: stage.id, name: stage.name, kind: stage.kind, position: stage.position, probability: stage.probability, updatedAt: stage.updatedAt.toISOString() })

export const readStages = (query: ListQuery) =>
  pageOf(query, ({ where, ...page }) => prisma.stage.findMany({ ...page, where: { ...where, ...(query.updatedSince ? { updatedAt: { gte: query.updatedSince } } : {}) } }), showStage)

const PRODUCT_READ = { project: { select: { id: true, name: true, archived: true, updatedAt: true } } } satisfies Prisma.ProductInclude

type ProductRow = Prisma.ProductGetPayload<{ include: typeof PRODUCT_READ }>

const showProduct = (product: ProductRow) => ({
  id: product.id,
  name: product.name,
  archived: product.archived,
  project: product.project && { id: product.project.id, name: product.project.name, archived: product.project.archived },
  updatedAt: product.updatedAt.toISOString(),
})

export const readProducts = (query: ListQuery) =>
  pageOf(
    query,
    ({ where, ...page }) =>
      prisma.product.findMany({ ...page, include: PRODUCT_READ, where: { ...where, ...(query.updatedSince ? { OR: [{ updatedAt: { gte: query.updatedSince } }, { project: { updatedAt: { gte: query.updatedSince } } }] } : {}) } }),
    showProduct,
  )
