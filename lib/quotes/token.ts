import { isSignedToken, newSignedToken } from '@/lib/signed-token'

/** A customer's link: a signed token, as lib/signed-token.ts says, so a made-up one never reaches the database. */

const QUOTE_LINK = 'quote-link'

export const newQuoteToken = (secret = process.env.BETTER_AUTH_SECRET): string => newSignedToken(QUOTE_LINK, secret)

export const isSignedQuoteToken = (token: string, secret = process.env.BETTER_AUTH_SECRET): boolean => isSignedToken(QUOTE_LINK, token, secret)

export const quoteLinkPath = (token: string) => `/q/${encodeURIComponent(token)}`
