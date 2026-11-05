import { oauthProviderClient } from '@better-auth/oauth-provider/client'
import { createAuthClient } from 'better-auth/react'

/** Sign-in and the consent page's answer, from the browser. An assistant's pending request continues by itself after signing in. */
export const authClient = createAuthClient({ plugins: [oauthProviderClient()] })
