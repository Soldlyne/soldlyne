import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * A customer's link: a random part, then the install's signature on it. The signature is checked before
 * anything else, so a bot trying addresses is turned away without waking the database. Only a hash of
 * the whole is stored, as for invitations. Signed with the install's one secret, so replacing that secret ends every open link.
 */

const signature = (random: string, secret: string) => createHmac('sha256', secret).update(`quote-link:${random}`).digest('base64url')

export function newQuoteToken(secret = process.env.BETTER_AUTH_SECRET): string {
  if (!secret) throw new Error('BETTER_AUTH_SECRET is not set: no link can be signed.')
  const random = randomBytes(32).toString('base64url')
  return `${random}.${signature(random, secret)}`
}

export function isSignedQuoteToken(token: string, secret = process.env.BETTER_AUTH_SECRET): boolean {
  const [random, signed, ...rest] = token.split('.')
  if (!secret || !random || !signed || rest.length > 0) return false
  const expected = Buffer.from(signature(random, secret))
  const given = Buffer.from(signed)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

export const quoteLinkPath = (token: string) => `/q/${encodeURIComponent(token)}`
