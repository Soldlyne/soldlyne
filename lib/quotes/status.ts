import type { QuoteStatus } from '@prisma/client'

/** What a quote is, as people see it. Expired isn't stored: see the model's comment. */
export type QuoteState = QuoteStatus | 'EXPIRED'

export const QUOTE_STATES: readonly QuoteState[] = ['DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED']

export const STATE_LABELS: Record<QuoteState, string> = { DRAFT: 'Draft', SENT: 'Sent', ACCEPTED: 'Accepted', DECLINED: 'Declined', EXPIRED: 'Expired' }

const DAY_MILLISECONDS = 86_400_000

/** Today as the database's dates hold it: midnight UTC. Validity turns on the UTC date, whoever is looking. */
export const todayUtc = (now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

export const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MILLISECONDS)

export const daysBetween = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / DAY_MILLISECONDS)

/** Sent and past its last day. That last day is still good, all of it. */
export const stateOf = (quote: { status: QuoteStatus; validUntil: Date }, now = new Date()): QuoteState => (quote.status === 'SENT' && quote.validUntil < todayUtc(now) ? 'EXPIRED' : quote.status)

/** "5 Nov 2026". UTC, since these are dates and not moments: a browser west of Greenwich mustn't show the day before. */
export const formatQuoteDate = (date: Date | string) => new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

/** "5 Nov 2026, 10:12 UTC", for the record of when someone answered. */
export const formatQuoteMoment = (moment: Date) => `${formatQuoteDate(moment)}, ${moment.toISOString().slice(11, 16)} UTC`

/** "2026-11-05", for a date field and for assistants. */
export const dateText = (date: Date) => date.toISOString().slice(0, 10)

export function readDate(text: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null
  const date = new Date(`${text}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) || dateText(date) !== text ? null : date
}
