import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * What the round trip through Google carries: a random check against the cookie, the workspace the
 * mailbox is for, and a signature tying both to the member who asked. The workspace travels rather than
 * being read again at the end, since the browser may have switched workspace in another tab meanwhile, and
 * a mailbox must land where it was asked for. The signature keeps it from landing on someone else's
 * behalf: the code is exchanged with that workspace's own client, so the two have to belong together.
 */

const signature = (random: string, workspaceId: string, memberId: string, secret: string) => createHmac('sha256', secret).update(`google-oauth:${random}.${workspaceId}.${memberId}`).digest('base64url')

export function newOAuthState(random: string, workspaceId: string, memberId: string, secret = process.env.BETTER_AUTH_SECRET): string {
  if (!secret) throw new Error('BETTER_AUTH_SECRET is not set: nothing can be signed.')
  return `${random}.${workspaceId}.${signature(random, workspaceId, memberId, secret)}`
}

export const workspaceOfOAuthState = (state: string) => state.split('.')[1] ?? ''

/** Whether this state was made for this member, and for the workspace it names. */
export function oauthStateIsFor(state: string, memberId: string, secret = process.env.BETTER_AUTH_SECRET): boolean {
  const [random, workspaceId, signed, ...rest] = state.split('.')
  if (!secret || !random || !workspaceId || !signed || rest.length > 0) return false
  const expected = Buffer.from(signature(random, workspaceId, memberId, secret))
  const given = Buffer.from(signed)
  return given.length === expected.length && timingSafeEqual(given, expected)
}
