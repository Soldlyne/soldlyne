import 'server-only'
import type { QuoteDocument } from './document'
import { quotePdf, quotePdfName } from './pdf'

/** The PDF as a download. Nothing keeps a copy on the way, and the address it came from stays out of any next site's logs. */
export async function pdfResponse(document: QuoteDocument): Promise<Response> {
  return new Response(Buffer.from(await quotePdf(document)), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${quotePdfName(document.reference)}"`,
      'cache-control': 'private, no-store',
      'referrer-policy': 'no-referrer',
      'x-robots-tag': 'noindex',
    },
  })
}
