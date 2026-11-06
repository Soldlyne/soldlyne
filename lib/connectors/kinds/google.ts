import 'server-only'
import { GOOGLE_CONNECTOR, GoogleAuthError, redirectUri, tokenRequest, type GoogleClient } from '@/lib/google/client'
import { prisma } from '@/lib/prisma'
import type { CheckAnswer, ConnectorDefinition } from '../types'

const NOT_A_REAL_TOKEN = 'soldlyne-connector-check'

const CHECKED = "Google accepted this client. It only looks at the redirect address when a mailbox connects, so that's where a wrong one would show."

/**
 * Tries the client at Google's token endpoint with a refresh token that can't exist, so nothing happens
 * for anyone. A client that passes gets invalid_grant, about the token, and any other answer is about the client.
 * That Google looks at the client first is how it behaves rather than something it documents: if it ever
 * didn't, a wrong secret would get through here and be said when the first mailbox connects.
 */
async function checkClient(client: GoogleClient): Promise<CheckAnswer> {
  try {
    await tokenRequest(client, { grant_type: 'refresh_token', refresh_token: NOT_A_REAL_TOKEN })
    return { ok: true, note: CHECKED }
  } catch (error) {
    if (!(error instanceof GoogleAuthError)) throw error
    if (error.code === 'invalid_grant') return { ok: true, note: CHECKED }
    if ((error.status ?? 0) >= 500) return { ok: false, reason: "Google didn't answer: try again in a moment.", unreachable: true }
    return { ok: false, reason: 'Google refused this client. Check its id and secret.' }
  }
}

async function mailboxesLeft(): Promise<string> {
  const mailboxes = await prisma.mailbox.findMany({ select: { email: true }, orderBy: { email: 'asc' } })
  if (mailboxes.length === 0) return 'No mailbox depends on it yet.'
  const addresses = mailboxes.map(({ email }) => email).join(', ')
  const stops = mailboxes.length === 1 ? `1 mailbox stops syncing: ${addresses}.` : `${mailboxes.length} mailboxes stop syncing: ${addresses}.`
  return `${stops} What's already logged stays on the timelines, and the tokens stay sealed. Connecting this same client again picks up where it left off; with another client, each mailbox has to connect again. Google shows a client's secret only once, so you may need a new one.`
}

export const google: ConnectorDefinition = {
  kind: GOOGLE_CONNECTOR,
  name: 'Google',
  summary: "Your company's own Google OAuth client. With it, members connect their mailboxes, and emails and meetings with people already in Soldlyne land on their timelines every hour.",
  rule: 'Read only: Soldlyne asks Google for nothing that could send.',
  fields: [
    { key: 'clientId', label: 'Client ID', secret: true, placeholder: '1234-abc.apps.googleusercontent.com' },
    { key: 'clientSecret', label: 'Client secret', secret: true, help: 'Google shows it only when the client is created, or when you add a new secret.' },
  ],
  setup: (publicAddress) => [
    { text: 'In the Google Cloud console, enable the Gmail API and the Google Calendar API.' },
    { text: 'Create an OAuth client of the Web application type, with this redirect address:', address: redirectUri(publicAddress) },
    { text: "On its consent screen, Internal avoids Google's review if everyone is on your Google Workspace." },
  ],
  check: ({ clientId, clientSecret }) => checkClient({ clientId, clientSecret }),
  whatStops: mailboxesLeft,
}
