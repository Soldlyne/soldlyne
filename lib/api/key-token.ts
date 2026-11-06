import { isSignedToken, newSignedToken } from '@/lib/signed-token'

const API_KEY = 'api-key'

/** Keys start with this, so one pasted somewhere it shouldn't be is recognisable. */
const KEY_START = 'sl_'

export const newApiKeyToken = (secret = process.env.BETTER_AUTH_SECRET): string => `${KEY_START}${newSignedToken(API_KEY, secret)}`

/** Whether the install signed this. Answered without the database: a made-up key stops here. */
export const isSignedApiKey = (key: string, secret = process.env.BETTER_AUTH_SECRET): boolean => key.startsWith(KEY_START) && isSignedToken(API_KEY, key.slice(KEY_START.length), secret)
