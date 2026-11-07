/** Display helpers shared by server and client code. */

export function personName(person: { firstName: string; lastName: string; emails?: string[] }): string {
  const name = `${person.firstName} ${person.lastName}`.trim()
  return name || person.emails?.[0] || 'Unnamed'
}

export function formatMoney(cents: bigint | number | null | undefined, currency = 'EUR'): string {
  if (cents === null || cents === undefined) return ''
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(cents) / 100)
}

/** "1 500", "1500.50", "1,500" -> cents. Empty -> null. */
export function parseMoney(input: string): bigint | null {
  const cleaned = input.replace(/[\s €$]/g, '').replace(/,(?=\d{1,2}$)/, '.').replace(/,/g, '')
  if (!cleaned) return null
  const value = Number(cleaned)
  if (!Number.isFinite(value)) throw new Error('Not an amount')
  return BigInt(Math.round(value * 100))
}

const DAY = 86_400_000

/** "today", "tomorrow", "in 3 days", "2 days ago", else "Oct 12". */
export function formatDue(date: Date | string | null | undefined, now = new Date()): string {
  if (!date) return ''
  const d = new Date(date)
  const days = Math.round((startOfDay(d) - startOfDay(now)) / DAY)
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  if (days > 1 && days < 7) return `in ${days} days`
  if (days < -1 && days > -7) return `${-days} days ago`
  return formatDate(d)
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return ''
  const d = new Date(date)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
}

export function formatDateTime(date: Date | string): string {
  const d = new Date(date)
  return `${formatDate(d)}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
}

export function formatRelative(date: Date | string, now = new Date()): string {
  const elapsed = now.getTime() - new Date(date).getTime()
  if (elapsed < 60_000) return 'just now'
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} min ago`
  if (elapsed < DAY) return `${Math.floor(elapsed / 3_600_000)} h ago`
  return formatDue(date, now)
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** acme.com from "https://www.acme.com/about" or "contact@acme.com". */
export function normalizeDomain(input: string | null | undefined): string | null {
  if (!input) return null
  let value = input.trim().toLowerCase()
  if (!value) return null
  if (value.includes('@') && !value.includes('/')) value = value.split('@').pop() ?? ''
  value = value.replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0]
  return value || null
}

/** Free-mail providers: their domain says nothing about the company. */
const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.fr', 'hotmail.com', 'hotmail.fr', 'outlook.com', 'outlook.fr', 'live.com', 'live.fr', 'msn.com',
  'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'gmx.fr', 'orange.fr', 'wanadoo.fr', 'free.fr', 'sfr.fr',
  'laposte.net', 'bbox.fr', 'neuf.fr', 'yandex.com', 'zoho.com',
])

export const isFreeMail = (domain: string) => FREE_MAIL.has(domain)

export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase()
}

export const CHANNELS = ['PHONE', 'EMAIL', 'LINKEDIN', 'SOCIAL', 'INBOUND', 'REFERRAL', 'EVENT', 'OTHER'] as const
export const CHANNEL_LABELS: Record<(typeof CHANNELS)[number], string> = {
  PHONE: 'Phone',
  EMAIL: 'Email',
  LINKEDIN: 'LinkedIn',
  SOCIAL: 'Social',
  INBOUND: 'Inbound',
  REFERRAL: 'Referral',
  EVENT: 'Event',
  OTHER: 'Other',
}

export const ACTIVITY_TYPES = ['CALL', 'EMAIL', 'LINKEDIN', 'MEETING', 'SOCIAL', 'SMS', 'OTHER'] as const
export const ACTIVITY_LABELS: Record<(typeof ACTIVITY_TYPES)[number], string> = {
  CALL: 'Call',
  EMAIL: 'Email',
  LINKEDIN: 'LinkedIn',
  MEETING: 'Meeting',
  SOCIAL: 'Social',
  SMS: 'SMS',
  OTHER: 'Other',
}

/** The current time, read once per render by server components. */
export function now(): Date {
  return new Date()
}
