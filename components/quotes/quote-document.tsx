import { formatMinor, formatPercent, formatQuantity } from '@/lib/quotes/amounts'
import type { QuoteDocument } from '@/lib/quotes/document'
import { formatQuoteDate } from '@/lib/quotes/status'

function Seller({ seller }: { seller: QuoteDocument['seller'] }) {
  return (
    <div className="min-w-0 text-sm">
      <p className="font-semibold">{seller.legalName}</p>
      <p className="whitespace-pre-wrap text-muted-foreground">{seller.address}</p>
      {seller.companyNumber && <p className="text-muted-foreground">Company number: {seller.companyNumber}</p>}
      {seller.vatNumber && <p className="text-muted-foreground">VAT number: {seller.vatNumber}</p>}
      {seller.contactEmail && <p className="text-muted-foreground">{seller.contactEmail}</p>}
    </div>
  )
}

function Customer({ customer }: { customer: QuoteDocument['customer'] }) {
  const place = [customer.city, customer.country].filter(Boolean).join(', ')
  return (
    <div className="min-w-0 text-sm">
      <p className="text-xs text-muted-foreground">For</p>
      {customer.companyName && <p className="font-medium">{customer.companyName}</p>}
      {customer.contactName && <p>{customer.contactName}</p>}
      {customer.contactEmail && <p className="text-muted-foreground">{customer.contactEmail}</p>}
      {place && <p className="text-muted-foreground">{place}</p>}
    </div>
  )
}

const CELL = 'border-b px-2 py-2 align-top'
const NUMBER = `${CELL} num text-right whitespace-nowrap`

function Lines({ lines, currency }: Pick<QuoteDocument, 'lines' | 'currency'>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] border-separate border-spacing-0 text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th className={`${CELL} text-left font-medium`}>Description</th>
            <th className={`${NUMBER} font-medium`}>Qty</th>
            <th className={`${NUMBER} font-medium`}>Unit price</th>
            <th className={`${NUMBER} font-medium`}>Disc.</th>
            <th className={`${NUMBER} font-medium`}>Tax</th>
            <th className={`${NUMBER} font-medium`}>Net</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={index}>
              <td className={`${CELL} whitespace-pre-wrap`}>{line.description}</td>
              <td className={NUMBER}>{formatQuantity(line.quantityMilli)}</td>
              <td className={NUMBER}>{formatMinor(line.unitPriceMinor, currency)}</td>
              <td className={NUMBER}>{line.discountMilliPercent ? formatPercent(line.discountMilliPercent) : ''}</td>
              <td className={NUMBER}>{formatPercent(line.taxRateMilliPercent)}</td>
              <td className={NUMBER}>{formatMinor(line.netMinor, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Totals({ currency, subtotalMinor, taxes, totalMinor }: Pick<QuoteDocument, 'currency' | 'subtotalMinor' | 'taxes' | 'totalMinor'>) {
  return (
    <dl className="ml-auto w-full max-w-sm space-y-1 text-sm">
      <div className="flex justify-between gap-4">
        <dt className="text-muted-foreground">Subtotal</dt>
        <dd className="num">{formatMinor(subtotalMinor, currency)}</dd>
      </div>
      {taxes.map((tax) => (
        <div key={tax.rateMilliPercent} className="flex justify-between gap-4">
          <dt className="text-muted-foreground">
            Tax {formatPercent(tax.rateMilliPercent)} on {formatMinor(tax.baseMinor, currency)}
          </dt>
          <dd className="num">{formatMinor(tax.taxMinor, currency)}</dd>
        </div>
      ))}
      <div className="flex justify-between gap-4 border-t pt-1 font-semibold">
        <dt>Total</dt>
        <dd className="num" data-testid="quote-total">
          {formatMinor(totalMinor, currency)}
        </dd>
      </div>
    </dl>
  )
}

function TextBlock({ title, text }: { title: string; text: string | null }) {
  if (!text?.trim()) return null
  return (
    <div className="text-sm">
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="whitespace-pre-wrap">{text}</p>
    </div>
  )
}

/** A quote as its customer reads it: on their page, and in a member's preview. */
export function QuoteDocumentView({ document }: { document: QuoteDocument }) {
  const { reference, issueDate, validUntil, seller, customer, lines, currency, notes, terms } = document
  return (
    <article className="space-y-6 rounded-lg border bg-background p-4 lg:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <Seller seller={seller} />
        <div className="text-sm sm:text-right">
          <h2 className="text-xl font-semibold">Quote</h2>
          <p>No. {reference}</p>
          <p className="text-muted-foreground">Issued {formatQuoteDate(issueDate)}</p>
          <p className="text-muted-foreground">Valid until {formatQuoteDate(validUntil)}</p>
        </div>
      </header>
      <Customer customer={customer} />
      <Lines lines={lines} currency={currency} />
      <Totals {...document} />
      <TextBlock title="Notes" text={notes} />
      <TextBlock title="Terms" text={terms} />
    </article>
  )
}
