import 'server-only'
import type { Fields } from '@/lib/secrets'
import { RESEND_CONNECTOR } from '../customer-mail'
import type { CheckAnswer, ConnectorDefinition } from '../types'

const RESEND_TIMEOUT_MS = 15_000

const ADDRESS = '[^\\s@<>]+@([^\\s@<>]+\\.[^\\s@<>]+)'

/** "Acme <quotes@acme.example>" or "quotes@acme.example". */
const SENDER = new RegExp(`^(?:${ADDRESS}|[^<>]*<${ADDRESS}>)$`)

export const domainOfSender = (sender: string): string | null => {
  const match = sender.match(SENDER)
  return (match?.[1] ?? match?.[2])?.toLowerCase() ?? null
}

type DomainList = { name?: string; message?: string; data?: { name: string; status: string }[] }

/** Resend's docs don't say whether verifying a domain covers its subdomains, so a sender on one isn't refused here: if Resend minds, it says so at sending. */
const coversSender = (verified: string, domain: string) => domain === verified || domain.endsWith(`.${verified}`)

/**
 * Asks Resend for the account's domains, which sends nothing. A sending-only key can't read them
 * (restricted_api_key), and that answer still proves the key. Its words go no further: only ours do.
 */
async function checkAccount({ apiKey, sender }: Fields): Promise<CheckAnswer> {
  const domain = domainOfSender(sender)
  if (!domain) return { ok: false, reason: 'The sender should read like Acme <quotes@acme.example>.' }
  const response = await fetch('https://api.resend.com/domains', { headers: { authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(RESEND_TIMEOUT_MS) })
  if (response.status >= 500 || response.status === 429) return { ok: false, reason: "Resend didn't answer: try again in a moment.", unreachable: true }
  const body = (await response.json().catch(() => ({}))) as DomainList
  if (response.status === 401 && body.name === 'restricted_api_key') return { ok: true, note: `Resend accepted this key. It can only send, so whether ${domain} is verified shows at the first quote.` }
  if (!response.ok) return { ok: false, reason: 'Resend refused this API key.' }
  const verified = (body.data ?? []).some(({ name, status }) => status === 'verified' && coversSender(name.toLowerCase(), domain))
  return verified ? { ok: true } : { ok: false, reason: `${domain} isn't a verified domain on this Resend account. Verify it there first, so that quotes come from your own domain.` }
}

export const resend: ConnectorDefinition = {
  kind: RESEND_CONNECTOR,
  name: 'Resend',
  summary: "Your company's own Resend account. With it, a quote's link goes to its customer by mail, from your own domain. Without it, whoever sends a quote gets the link to copy.",
  rule: "Transactional mail for your company only, never prospecting: that's Coldlyne's job, and Resend's terms forbid cold email.",
  fields: [
    { key: 'apiKey', label: 'API key', secret: true, placeholder: 're_...' },
    { key: 'sender', label: 'Sender', secret: false, placeholder: 'Acme <quotes@acme.example>', help: 'On a domain verified at Resend. Replies go to the contact email in your seller details.' },
  ],
  setup: () => [{ text: 'In Resend, verify your domain, then create an API key.' }],
  check: checkAccount,
  whatStops: async () => "Quotes stop going out by mail: whoever sends one gets its link to copy instead. Links already sent keep working. Soldlyne's own mail to its members doesn't go through this.",
}
