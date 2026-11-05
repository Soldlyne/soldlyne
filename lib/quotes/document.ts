import type { SellerDetails } from '@prisma/client'
import { customerCopyOf, sellerCopyOf, type CustomerCopy, type SellerCopy } from './parties'
import type { FullQuote } from './queries'
import { stateOf, type QuoteState } from './status'
import { readStoredTaxes, type TaxAtRate } from './totals'

/** A quote as its customer reads it, on the page or in the PDF: both are drawn from this, so they can't differ. */
export type QuoteDocument = {
  reference: string
  state: QuoteState
  currency: string
  issueDate: Date
  validUntil: Date
  notes: string | null
  terms: string | null
  seller: SellerCopy
  customer: CustomerCopy
  lines: Pick<FullQuote['lines'][number], 'description' | 'quantityMilli' | 'unitPriceMinor' | 'taxRateMilliPercent' | 'discountMilliPercent' | 'netMinor'>[]
  subtotalMinor: bigint
  taxes: TaxAtRate[]
  taxMinor: bigint
  totalMinor: bigint
  accepted: { name: string; at: Date } | null
  declinedAt: Date | null
}

/** From the copies made when it was sent; a draft, not yet sent, shows the details as they stand today. */
export function quoteDocument(quote: FullQuote, liveSeller: SellerDetails | null, now = new Date()): QuoteDocument {
  const { reference, currency, issueDate, validUntil, notes, terms, lines, subtotalMinor, taxMinor, totalMinor, acceptedName, acceptedAt, declinedAt } = quote
  return {
    reference,
    state: stateOf(quote, now),
    currency,
    issueDate,
    validUntil,
    notes,
    terms,
    seller: quote.status === 'DRAFT' ? sellerCopyOf(liveSeller) : (quote.sellerCopy as SellerCopy),
    customer: quote.status === 'DRAFT' ? customerCopyOf(quote) : (quote.customerCopy as CustomerCopy),
    lines,
    subtotalMinor,
    taxes: readStoredTaxes(quote.taxBreakdown),
    taxMinor,
    totalMinor,
    accepted: acceptedName && acceptedAt ? { name: acceptedName, at: acceptedAt } : null,
    declinedAt,
  }
}
