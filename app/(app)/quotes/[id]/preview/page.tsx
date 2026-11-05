import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { QuoteDocumentView } from '@/components/quotes/quote-document'
import { Button } from '@/components/ui/button'
import { quoteDocument } from '@/lib/quotes/document'
import { readQuote, sellerDetailsOfWorkspace } from '@/lib/quotes/queries'

export const metadata: Metadata = { title: 'Quote preview' }

/** What the customer would see, from the same document as their page. A draft shows the seller details as they stand today. */
export default async function QuotePreviewPage({ params }: PageProps<'/quotes/[id]/preview'>) {
  const { id } = await params
  const [quote, seller] = await Promise.all([readQuote(id), sellerDetailsOfWorkspace()])
  if (!quote) notFound()
  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-4 lg:p-8">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm text-muted-foreground">{quote.status === 'DRAFT' ? 'A preview: the customer sees this once it is sent.' : 'As the customer sees it.'}</p>
        <Button variant="outline" size="sm" asChild>
          <a href={`/quotes/${id}/pdf`}>Download PDF</a>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/quotes/${id}`}>{quote.status === 'DRAFT' ? 'Back to editing' : 'Back to the quote'}</Link>
        </Button>
      </div>
      <QuoteDocumentView document={quoteDocument(quote, seller)} />
    </div>
  )
}
