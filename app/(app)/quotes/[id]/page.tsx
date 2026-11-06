import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import type { Prisma } from '@prisma/client'
import { QuoteDocumentView } from '@/components/quotes/quote-document'
import { QuoteStateBadge } from '@/components/quotes/quote-state-badge'
import { listProducts } from '@/lib/crm/queries'
import { personName } from '@/lib/crm/format'
import { canMailCustomers } from '@/lib/connectors/customer-mail'
import { prisma } from '@/lib/prisma'
import { PERCENT_DIGITS, shortDecimalText } from '@/lib/quotes/amounts'
import { quoteDocument, type QuoteDocument } from '@/lib/quotes/document'
import { lineAsText } from '@/lib/quotes/lines'
import { readQuote, sellerDetailsOfWorkspace, type FullQuote } from '@/lib/quotes/queries'
import { missingToSend } from '@/lib/quotes/send-rules'
import { dateText, formatQuoteDate, formatQuoteMoment } from '@/lib/quotes/status'
import { QuoteDesk } from './desk'
import { QuoteEditor } from './editor'
import { QuoteToolbar } from './toolbar'

const live = { deletedAt: null }

export async function generateMetadata({ params }: PageProps<'/quotes/[id]'>): Promise<Metadata> {
  const quote = await prisma.quote.findUnique({ where: { id: (await params).id }, select: { reference: true } })
  return { title: quote ? `Quote ${quote.reference}` : 'Quote' }
}

/** What the customer did, for the member: the record of who accepted, from where. */
function Answer({ quote }: { quote: FullQuote }) {
  if (quote.acceptedAt) {
    return (
      <div className="rounded-md border border-success/25 bg-success/10 px-3 py-2 text-sm" data-testid="quote-answer">
        <p className="font-medium">
          Accepted by {quote.acceptedName} on {formatQuoteMoment(quote.acceptedAt)}.
        </p>
        <p className="text-muted-foreground">
          IP address: {quote.acceptedIp ?? 'unknown'}. Browser: {quote.acceptedUserAgent ?? 'unknown'}.
        </p>
      </div>
    )
  }
  if (!quote.declinedAt) return null
  return (
    <div className="rounded-md border px-3 py-2 text-sm" data-testid="quote-answer">
      <p className="font-medium">Declined on {formatQuoteDate(quote.declinedAt)}.</p>
      {quote.declineReason && <p className="whitespace-pre-wrap text-muted-foreground">{quote.declineReason}</p>}
    </div>
  )
}

/** Whom the contact picker offers: the customer's people, and whoever is already chosen. */
function peopleToOffer({ companyId, contactId }: FullQuote): Prisma.PersonWhereInput {
  if (!companyId) return live
  return { ...live, OR: [{ companyId }, ...(contactId ? [{ id: contactId }] : [])] }
}

/** The draft's editor, with what its pickers offer. */
async function DraftEditor({ quote, defaultTaxRate }: { quote: FullQuote; defaultTaxRate: number }) {
  const [products, companies, people] = await Promise.all([
    listProducts(),
    prisma.company.findMany({ where: live, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 500 }),
    prisma.person.findMany({ where: peopleToOffer(quote), select: { id: true, firstName: true, lastName: true, emails: true }, orderBy: { lastName: 'asc' }, take: 500 }),
  ])
  return (
    <QuoteEditor
      id={quote.id}
      initial={{ companyId: quote.companyId ?? '', contactId: quote.contactId ?? '', currency: quote.currency, issueDate: dateText(quote.issueDate), validUntil: dateText(quote.validUntil), notes: quote.notes ?? '', terms: quote.terms ?? '' }}
      initialLines={quote.lines.map((line) => lineAsText(line, quote.currency))}
      companies={companies.map(({ id, name }) => ({ value: id, label: name }))}
      people={people.map((person) => ({ value: person.id, label: personName(person) }))}
      products={products.map(({ id, label, pricing }) => ({ value: id, label, pricing }))}
      defaultTaxRate={shortDecimalText(BigInt(defaultTaxRate), PERCENT_DIGITS)}
    />
  )
}

function recipientOf({ customer }: QuoteDocument, canMail: boolean): string | null {
  if (!customer.contactEmail || !canMail) return null
  return customer.contactName ? `${customer.contactName} (${customer.contactEmail})` : customer.contactEmail
}

export default async function QuotePage({ params }: PageProps<'/quotes/[id]'>) {
  const { id } = await params
  const [quote, seller, canMail] = await Promise.all([readQuote(id), sellerDetailsOfWorkspace(), canMailCustomers()])
  if (!quote) notFound()
  const document = quoteDocument(quote, seller)
  const draft = quote.status === 'DRAFT'
  const missing = draft ? missingToSend({ seller: document.seller, customer: document.customer, lineCount: quote.lines.length, validUntil: quote.validUntil }, { canMail }) : []
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 lg:p-8">
      <nav className="flex items-center gap-1 text-xs text-muted-foreground">
        <Link href="/quotes" className="hover:text-foreground">
          Quotes
        </Link>
        {quote.deal && (
          <>
            <ChevronRight className="size-3" aria-hidden />
            <Link href={`/deals/${quote.deal.id}`} className="hover:text-foreground">
              {quote.deal.name}
            </Link>
          </>
        )}
      </nav>
      <QuoteDesk>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">Quote {quote.reference}</h1>
          <QuoteStateBadge state={document.state} />
        </div>
        <QuoteToolbar id={id} reference={quote.reference} state={document.state} recipient={recipientOf(document, canMail)} missing={missing} />
        {draft ? (
          <DraftEditor quote={quote} defaultTaxRate={seller?.defaultTaxRateMilliPercent ?? 0} />
        ) : (
          <>
            <Answer quote={quote} />
            <QuoteDocumentView document={document} />
          </>
        )}
      </QuoteDesk>
    </div>
  )
}
