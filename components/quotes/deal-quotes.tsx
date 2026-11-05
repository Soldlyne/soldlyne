import Link from 'next/link'
import { Panel } from '@/components/crm/record-layout'
import { formatMinor } from '@/lib/quotes/amounts'
import { listQuotes } from '@/lib/quotes/queries'
import { formatQuoteDate, stateOf } from '@/lib/quotes/status'
import { NewQuoteButton } from './new-quote-button'
import { QuoteStateBadge } from './quote-state-badge'

/** The deal's quotes, the latest first, on the deal's page. */
export async function DealQuotes({ dealId }: { dealId: string }) {
  const quotes = await listQuotes({ dealId })
  return (
    <Panel title="Quotes" action={<NewQuoteButton dealId={dealId} />}>
      {quotes.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-4 text-center text-sm text-muted-foreground">No quote on this deal yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {quotes.map((quote) => (
            <li key={quote.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
              <Link href={`/quotes/${quote.id}`} className="font-medium hover:underline">
                {quote.reference}
              </Link>
              <QuoteStateBadge state={stateOf(quote)} />
              <span className="num ml-auto">{formatMinor(quote.totalMinor, quote.currency)}</span>
              <span className="text-xs text-muted-foreground">until {formatQuoteDate(quote.validUntil)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
