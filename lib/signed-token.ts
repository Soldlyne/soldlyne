import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * A secret handed out once: a random part, then the install's signature on it. The signature is
 * checked before anything else, so a bot trying values is turned away without waking the database.
 * Only a hash of the whole is stored. Signed with the install's one secret, so replacing that secret ends every token still out.
 */

const signature = (purpose: string, random: string, secret: string) => createHmac('sha256', secret).update(`${purpose}:${random}`).digest('base64url')

export function newSignedToken(purpose: string, secret: string | undefined): string {
  if (!secret) throw new Error('BETTER_AUTH_SECRET is not set: nothing can be signed.')
  const random = randomBytes(32).toString('base64url')
  return `${random}.${signature(purpose, random, secret)}`
}

export function isSignedToken(purpose: string, token: string, secret: string | undefined): boolean {
  const [random, signed, ...rest] = token.split('.')
  if (!secret || !random || !signed || rest.length > 0) return false
  const expected = Buffer.from(signature(purpose, random, secret))
  const given = Buffer.from(signed)
  return given.length === expected.length && timingSafeEqual(given, expected)
}
