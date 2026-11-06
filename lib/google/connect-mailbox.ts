import 'server-only'
import { markFailing } from '@/lib/connectors/connections'
import { currentWorkspaceId, prisma } from '@/lib/prisma'
import { sealText } from '@/lib/secrets'
import { mailboxesChanged } from '@/lib/sync/mailboxes-changed'
import { CLIENT_REFUSED, exchangeCode, GOOGLE_CONNECTOR, GoogleAuthError, googleClient, profileFromIdToken, type GoogleClient } from './client'

export type MailboxConnected = { email: string } | { error: string }

/** A code Google wouldn't take: said as a word the Mailboxes page explains, since what Google wrote stays out of it. */
async function exchangeOrRefusal(client: GoogleClient, code: string, origin: string) {
  try {
    return await exchangeCode(client, code, origin)
  } catch (error) {
    if (!(error instanceof GoogleAuthError) || error.code !== 'invalid_client') return { refused: 'google_refused' }
    await markFailing(GOOGLE_CONNECTOR, CLIENT_REFUSED)
    return { refused: 'client_refused' }
  }
}

/** Ends connecting a mailbox, in the workspace it was asked for: its own client takes the code, and the tokens are sealed on its row. */
export async function finishConnectingMailbox(code: string, origin: string): Promise<MailboxConnected> {
  // Disconnected during the round trip, or sealed under a key the install no longer has: the same word either way.
  const client = await googleClient().catch(() => null)
  if (!client) return { error: 'no_connector' }
  const token = await exchangeOrRefusal(client, code, origin)
  if ('refused' in token) return { error: token.refused }
  if (!token.refresh_token || !token.id_token) return { error: 'no_refresh_token' }
  if (!token.scope.includes('gmail.readonly')) return { error: 'scopes' }
  const profile = await profileFromIdToken(token.id_token)
  const data = {
    refreshToken: sealText(token.refresh_token),
    accessToken: sealText(token.access_token),
    tokenExpiresAt: new Date(Date.now() + token.expires_in * 1000),
    scopes: token.scope.split(' '),
    authFailedAt: null,
    lastError: null,
    active: true,
  }
  const workspaceId = await currentWorkspaceId()
  await prisma.mailbox.upsert({ where: { workspaceId_email: { workspaceId, email: profile.email } }, create: { workspaceId, email: profile.email, displayName: profile.name ?? profile.email.split('@')[0], ...data }, update: data })
  mailboxesChanged()
  return { email: profile.email }
}
