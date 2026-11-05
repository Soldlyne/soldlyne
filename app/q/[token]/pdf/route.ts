import { LINK_UNKNOWN, seeQuoteAtLink } from '@/lib/quotes/answer'
import { pdfResponse } from '@/lib/quotes/pdf-response'

/** The PDF for whoever holds the customer's link, whatever has become of the quote since. */
export async function GET(_request: Request, { params }: RouteContext<'/q/[token]/pdf'>) {
  const seen = await seeQuoteAtLink((await params).token)
  if (!seen.found) return new Response(LINK_UNKNOWN, { status: 404, headers: { 'referrer-policy': 'no-referrer' } })
  return pdfResponse(seen.document)
}
