import 'server-only'
import { connectedFields, markFailing } from '@/lib/connectors/connections'
import { prisma } from '@/lib/prisma'
import { openText, sealText } from '@/lib/secrets'

/**
 * Minimal Google OAuth + Gmail and Calendar REST client (no googleapis dependency).
 * Read access only: Soldlyne logs emails and meetings, it never sends anything.
 * Scopes: read messages and history, read events, and the address of the
 * connected mailbox.
 */
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  // Meetings with contacts on their timelines.
  'https://www.googleapis.com/auth/calendar.events.readonly',
  'openid',
  'email',
  'profile',
]

/** The connector that holds each workspace's OAuth client. */
export const GOOGLE_CONNECTOR = 'google'

export type GoogleClient = { clientId: string; clientSecret: string }

/**
 * The OAuth client of the workspace this runs in. Each company registers its own at Google, and a token
 * can only be refreshed by the client it was issued to, so another workspace's would be no use anyway.
 * Null while it has none, or while Google refuses it.
 */
export async function googleClient(): Promise<GoogleClient | null> {
  const fields = await connectedFields(GOOGLE_CONNECTOR)
  return fields && { clientId: fields.clientId, clientSecret: fields.clientSecret }
}

/** Holds the OAuth state between the connect route and the callback. */
export const OAUTH_STATE_COOKIE = 'google_oauth_state'
export const OAUTH_STATE_PATH = '/api/google'

export function redirectUri(origin: string) {
  return `${origin}/api/google/callback`
}

export function authorizationUrl(client: GoogleClient, origin: string, state: string, loginHint?: string) {
  const params = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: redirectUri(origin),
    response_type: 'code',
    // No include_granted_scopes: a mailbox connected earlier must not bring back wider grants.
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline',
    // Always return a refresh token, even when the mailbox was connected before.
    prompt: 'consent',
    state,
  })
  if (loginHint) params.set('login_hint', loginHint)
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string; scope: string; id_token?: string; error?: string; error_description?: string }

const GOOGLE_TIMEOUT_MS = 15_000

export async function tokenRequest(client: GoogleClient, body: Record<string, string>): Promise<TokenResponse> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: client.clientId, client_secret: client.clientSecret, ...body }),
    signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
  })
  const data = (await response.json()) as TokenResponse
  if (!response.ok) throw new GoogleAuthError(data.error ?? `HTTP ${response.status}`, data.error_description, response.status)
  return data
}

export class GoogleAuthError extends Error {
  constructor(
    public code: string,
    description?: string,
    public status?: number,
  ) {
    super(description ? `${code}: ${description}` : code)
  }
}

export async function exchangeCode(client: GoogleClient, code: string, origin: string) {
  return tokenRequest(client, { code, grant_type: 'authorization_code', redirect_uri: redirectUri(origin) })
}

/** In Soldlyne's own words, for the connector's card: nothing about one mailbox, and the client is what to fix. */
export const CLIENT_REFUSED = "Google refused this client's id or secret. Check them, or connect it again with a new secret."

const MAILBOX_REFUSED = "Google refused this mailbox's access: connect it again."

/**
 * Who a refusal is about. A refused client is the workspace's connector to fix, and fixing it brings every
 * mailbox back. Refused tokens are that one mailbox's, which has to connect again.
 */
async function recordRefusal(mailboxId: string, error: GoogleAuthError) {
  if (error.code === 'invalid_client') return markFailing(GOOGLE_CONNECTOR, CLIENT_REFUSED)
  if (['invalid_grant', 'unauthorized_client'].includes(error.code)) await prisma.mailbox.update({ where: { id: mailboxId }, data: { authFailedAt: new Date(), lastError: MAILBOX_REFUSED } })
}

export async function profileFromIdToken(idToken: string): Promise<{ email: string; name?: string }> {
  const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8'))
  return { email: String(payload.email).toLowerCase(), name: payload.name }
}

/** A valid access token for the mailbox, refreshed when it expires within a minute. */
export async function accessToken(mailboxId: string): Promise<string> {
  const mailbox = await prisma.mailbox.findUniqueOrThrow({ where: { id: mailboxId } })
  if (mailbox.accessToken && mailbox.tokenExpiresAt && mailbox.tokenExpiresAt.getTime() > Date.now() + 60_000) {
    return openText(mailbox.accessToken)
  }
  const client = await googleClient()
  if (!client) throw new GoogleAuthError('no_client', 'This workspace has no working Google connector.')
  try {
    const token = await tokenRequest(client, { refresh_token: openText(mailbox.refreshToken), grant_type: 'refresh_token' })
    await prisma.mailbox.update({
      where: { id: mailboxId },
      data: {
        accessToken: sealText(token.access_token),
        tokenExpiresAt: new Date(Date.now() + token.expires_in * 1000),
        authFailedAt: null,
        ...(token.refresh_token ? { refreshToken: sealText(token.refresh_token) } : {}),
      },
    })
    return token.access_token
  } catch (error) {
    if (error instanceof GoogleAuthError) await recordRefusal(mailboxId, error)
    throw error
  }
}

export class GmailError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

async function gmail<T>(mailboxId: string, path: string): Promise<T> {
  const token = await accessToken(mailboxId)
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, { headers: { authorization: `Bearer ${token}` } })
  if (!response.ok) throw new GmailError(response.status, `Gmail ${path.split('?')[0]}: ${response.status}`)
  return (await response.json()) as T
}

export async function currentHistoryId(mailboxId: string): Promise<string> {
  return (await gmail<{ historyId: string; emailAddress: string }>(mailboxId, 'profile')).historyId
}

type HistoryPage = { history?: { messagesAdded?: { message: { id: string; threadId: string; labelIds?: string[] } }[] }[]; nextPageToken?: string; historyId: string }

/** Messages added since the cursor (received and sent). Throws GmailError 404 when the cursor is too old. */
export async function messagesSince(mailboxId: string, startHistoryId: string) {
  const added: { id: string; threadId: string }[] = []
  let pageToken: string | undefined
  let historyId = startHistoryId
  do {
    const params = new URLSearchParams({ startHistoryId, historyTypes: 'messageAdded', maxResults: '500' })
    if (pageToken) params.set('pageToken', pageToken)
    const page = await gmail<HistoryPage>(mailboxId, `history?${params}`)
    for (const entry of page.history ?? []) for (const { message } of entry.messagesAdded ?? []) added.push(message)
    historyId = page.historyId
    pageToken = page.nextPageToken
  } while (pageToken)
  return { added, historyId }
}

export type MessageMeta = { id: string; threadId: string; snippet: string; headers: Record<string, string>; internalDate: number; labelIds: string[] }

export async function messageMeta(mailboxId: string, id: string): Promise<MessageMeta> {
  const params = new URLSearchParams({ format: 'metadata' })
  for (const header of ['From', 'To', 'Cc', 'Subject', 'Auto-Submitted', 'List-Unsubscribe', 'List-Id', 'Precedence']) {
    params.append('metadataHeaders', header)
  }
  const message = await gmail<{ id: string; threadId: string; snippet: string; internalDate: string; labelIds?: string[]; payload: { headers: { name: string; value: string }[] } }>(
    mailboxId,
    `messages/${id}?${params}`,
  )
  const headers: Record<string, string> = {}
  for (const { name, value } of message.payload.headers) headers[name.toLowerCase()] = value
  return { id: message.id, threadId: message.threadId, snippet: message.snippet, headers, internalDate: Number(message.internalDate), labelIds: message.labelIds ?? [] }
}

export type CalendarEvent = {
  id: string
  status: 'confirmed' | 'tentative' | 'cancelled'
  summary?: string
  description?: string
  location?: string
  hangoutLink?: string
  htmlLink?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  attendees?: { email: string; displayName?: string; organizer?: boolean; self?: boolean; responseStatus?: string }[]
  organizer?: { email: string; self?: boolean }
}

/**
 * Changes of the primary calendar since the sync token; the first sync takes
 * the last 30 days and everything ahead. Throws GmailError 410 when the token expired.
 */
export async function calendarChanges(mailboxId: string, syncToken: string | null) {
  const token = await accessToken(mailboxId)
  const events: CalendarEvent[] = []
  let pageToken: string | undefined
  let nextSyncToken: string | undefined
  do {
    const params = new URLSearchParams({ singleEvents: 'true', maxResults: '250', showDeleted: 'true' })
    if (syncToken) params.set('syncToken', syncToken)
    else params.set('timeMin', new Date(Date.now() - 30 * 86_400_000).toISOString())
    if (pageToken) params.set('pageToken', pageToken)
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, { headers: { authorization: `Bearer ${token}` } })
    if (!response.ok) throw new GmailError(response.status, `Calendar: ${response.status}`)
    const page = (await response.json()) as { items?: CalendarEvent[]; nextPageToken?: string; nextSyncToken?: string }
    events.push(...(page.items ?? []))
    pageToken = page.nextPageToken
    nextSyncToken = page.nextSyncToken ?? nextSyncToken
  } while (pageToken)
  return { events, nextSyncToken: nextSyncToken ?? null }
}
