import type { Metadata } from 'next'
import Link from 'next/link'
import { EmptyState, ListHeader, RowLink, Td, Th } from '@/components/crm/list-page'
import { QuoteStateBadge } from '@/components/quotes/quote-state-badge'
import { param, type Params } from '@/lib/crm/list-filters'
import { formatMinor } from '@/lib/quotes/amounts'
import { customerNameOf, listQuotes } from '@/lib/quotes/queries'
import { formatQuoteDate, QUOTE_STATES, STATE_LABELS, stateOf, type QuoteState } from '@/lib/quotes/status'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Quotes' }

const stateNamed = (name: string | undefined) => QUOTE_STATES.find((state) => state.toLowerCase() === name)

function StateFilter({ active }: { active: QuoteState | undefined }) {
  const tab = (label: string, href: string, on: boolean) => (
    <Link key={label} href={href} aria-current={on ? 'page' : undefined} className={cn('rounded-md px-2 py-1 text-xs font-medium', on ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground')}>
      {label}
    </Link>
  )
  return (
    <nav aria-label="Filter by status" className="flex flex-wrap items-center gap-1 border-b px-4 py-2 lg:px-6">
      {tab('All', '/quotes', !active)}
      {QUOTE_STATES.map((state) => tab(STATE_LABELS[state], `/quotes?status=${state.toLowerCase()}`, active === state))}
    </nav>
  )
}

export default async function QuotesPage({ searchParams }: PageProps<'/quotes'>) {
  const state = stateNamed(param((await searchParams) as Params, 'status'))
  const quotes = await listQuotes({ state })
  return (
    <>
      <ListHeader title="Quotes" count={quotes.length} search={false} />
      <StateFilter active={state} />
      {quotes.length === 0 ? (
        <EmptyState title={state ? `No ${STATE_LABELS[state].toLowerCase()} quotes` : 'No quotes yet'} hint="A quote starts from a deal: open one and press New quote." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <Th className="pl-4 lg:pl-6">Number</Th>
                <Th>Status</Th>
                <Th>Customer</Th>
                <Th>Deal</Th>
                <Th className="text-right">Total</Th>
                <Th>Issued</Th>
                <Th>Valid until</Th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((quote) => (
                <tr key={quote.id} className="hover:bg-accent/40">
                  <Td className="pl-4 lg:pl-6">
                    <RowLink href={`/quotes/${quote.id}`}>{quote.reference}</RowLink>
                  </Td>
                  <Td>
                    <QuoteStateBadge state={stateOf(quote)} />
                  </Td>
                  <Td>{customerNameOf(quote)}</Td>
                  <Td className="text-muted-foreground">{quote.deal && <Link href={`/deals/${quote.deal.id}`} className="hover:underline">{quote.deal.name}</Link>}</Td>
                  <Td className="num text-right">{formatMinor(quote.totalMinor, quote.currency)}</Td>
                  <Td className="text-muted-foreground">{formatQuoteDate(quote.issueDate)}</Td>
                  <Td className="text-muted-foreground">{formatQuoteDate(quote.validUntil)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
