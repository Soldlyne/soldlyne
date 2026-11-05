import type { Metadata } from 'next'
import { QuoteDocumentView } from '@/components/quotes/quote-document'
import { Button } from '@/components/ui/button'
import { LINK_UNKNOWN, seeQuoteAtLink } from '@/lib/quotes/answer'
import { acceptFromPage, declineFromPage } from '@/lib/quotes/customer-actions'
import type { QuoteDocument } from '@/lib/quotes/document'
import { formatQuoteDate } from '@/lib/quotes/status'
import { quoteLinkPath } from '@/lib/quotes/token'
import { AnswerForms } from './answer-forms'

// The link is the key to the quote: it mustn't follow someone to the next site they visit.
export const metadata: Metadata = { title: 'Quote', referrer: 'no-referrer' }

/** Where things stand, in a sentence. Only a quote still good takes an answer. */
function standing({ state, accepted, declinedAt, validUntil, seller }: QuoteDocument): string | null {
  if (state === 'ACCEPTED' && accepted) return `This quote was accepted by ${accepted.name} on ${formatQuoteDate(accepted.at)}.`
  if (state === 'DECLINED' && declinedAt) return `This quote was declined on ${formatQuoteDate(declinedAt)}.`
  if (state === 'EXPIRED') return `This quote expired on ${formatQuoteDate(validUntil)}, and can no longer be accepted. Ask ${seller.legalName} for a new one.`
  return null
}

export default async function CustomerQuotePage({ params }: PageProps<'/q/[token]'>) {
  const { token } = await params
  const seen = await seeQuoteAtLink(token)
  if (!seen.found) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-surface px-4">
        <div className="w-full max-w-sm">
          <h1 className="text-xl font-semibold">This link doesn&apos;t open a quote</h1>
          <p className="mt-2 text-sm text-muted-foreground">{LINK_UNKNOWN}</p>
        </div>
      </main>
    )
  }
  const { document } = seen
  const message = standing(document)
  return (
    <main className="min-h-svh bg-surface px-4 py-6 lg:py-10">
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-semibold">
            Quote {document.reference} from {document.seller.legalName}
          </h1>
          <Button variant="outline" size="sm" asChild>
            <a href={`${quoteLinkPath(token)}/pdf`}>Download PDF</a>
          </Button>
        </div>
        {message && (
          <p role="status" className="rounded-md border bg-background px-3 py-2 text-sm" data-testid="quote-standing">
            {message}
          </p>
        )}
        <QuoteDocumentView document={document} />
        {document.state === 'SENT' && <AnswerForms accept={acceptFromPage.bind(null, token)} decline={declineFromPage.bind(null, token)} sellerName={document.seller.legalName} />}
      </div>
    </main>
  )
}
