import { quoteDocument } from '@/lib/quotes/document'
import { pdfResponse } from '@/lib/quotes/pdf-response'
import { readQuote, sellerDetailsOfWorkspace } from '@/lib/quotes/queries'

/** The PDF for a member, a draft's included. The tenant client finds only this workspace's quotes. */
export async function GET(_request: Request, { params }: RouteContext<'/quotes/[id]/pdf'>) {
  const [quote, seller] = await Promise.all([readQuote((await params).id), sellerDetailsOfWorkspace()])
  if (!quote) return new Response('Not found', { status: 404 })
  return pdfResponse(quoteDocument(quote, seller))
}
