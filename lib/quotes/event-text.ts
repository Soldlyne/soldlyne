type Properties = { reference?: string; to?: string | null; by?: string; reason?: string | null; copiedFrom?: string }

/** A quote's timeline line. What a customer typed appears as they typed it: it's their own words, and the timeline shows it as text. */
export function quoteEventText(action: string, { reference, to, by, reason, copiedFrom }: Properties): string {
  const quote = `Quote ${reference}`
  switch (action) {
    case 'created':
      return copiedFrom ? `${quote} created from ${copiedFrom}` : `${quote} created`
    case 'sent':
      return to ? `${quote} sent to ${to}` : `${quote} sent, with a link to pass on`
    case 'link_renewed':
      return to ? `${quote}: a new link sent to ${to}` : `${quote}: a new link to pass on`
    case 'accepted':
      return `${quote} accepted by ${by}`
    case 'declined':
      return `${quote} declined${reason ? `: ${reason}` : ''}`
    default:
      return `${quote} ${action}`
  }
}
