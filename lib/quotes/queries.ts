import 'server-only'
import type { Prisma } from '@prisma/client'
import { personName } from '@/lib/crm/format'
import { prisma } from '@/lib/prisma'
import type { CustomerCopy } from './parties'
import { todayUtc, type QuoteState } from './status'

const companyDetails = { select: { id: true, name: true, city: true, country: true } } satisfies Prisma.CompanyDefaultArgs

export const quoteInclude = {
  lines: { orderBy: { position: 'asc' } },
  deal: { select: { id: true, name: true } },
  company: companyDetails,
  contact: { select: { id: true, firstName: true, lastName: true, emails: true, company: companyDetails } },
} satisfies Prisma.QuoteInclude

export type FullQuote = Prisma.QuoteGetPayload<{ include: typeof quoteInclude }>

const listInclude = {
  deal: { select: { id: true, name: true } },
  company: { select: { id: true, name: true } },
  contact: { select: { id: true, firstName: true, lastName: true, emails: true } },
} satisfies Prisma.QuoteInclude

/** Expired is a sent quote past its date, so the database can filter on it without anything having stored it. */
export function quoteStateWhere(state: QuoteState | undefined, now = new Date()): Prisma.QuoteWhereInput {
  const today = todayUtc(now)
  if (state === 'EXPIRED') return { status: 'SENT', validUntil: { lt: today } }
  if (state === 'SENT') return { status: 'SENT', validUntil: { gte: today } }
  return state ? { status: state } : {}
}

export type QuoteFilter = { state?: QuoteState; dealId?: string; take?: number }

export function listQuotes({ state, dealId, take = 200 }: QuoteFilter = {}) {
  return prisma.quote.findMany({
    where: { ...quoteStateWhere(state), ...(dealId ? { dealId } : {}) },
    orderBy: { number: 'desc' },
    take,
    include: listInclude,
  })
}

export type QuoteRow = Awaited<ReturnType<typeof listQuotes>>[number]

export const readQuote = (id: string) => prisma.quote.findUnique({ where: { id }, include: quoteInclude })

export const sellerDetailsOfWorkspace = () => prisma.sellerDetails.findFirst()

/** Who a row is for: the copy once sent, since a renamed company doesn't rewrite what was sent. */
export function customerNameOf({ customerCopy, company, contact }: Pick<QuoteRow, 'customerCopy' | 'company' | 'contact'>): string {
  const copied = customerCopy as CustomerCopy | null
  if (copied) return copied.companyName || copied.contactName || copied.contactEmail
  return company?.name ?? (contact ? personName(contact) : '')
}
