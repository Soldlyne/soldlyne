import 'server-only'
import { oauthProviderAuthServerMetadata, oauthProviderOpenIdConfigMetadata } from '@better-auth/oauth-provider'
import { unstable_cache } from 'next/cache'
import { auth } from './auth'
import { publicUrl } from './public-url'

const A_WEEK_IN_SECONDS = 604_800

/**
 * A discovery document, kept outside the database: it only says what this install's address and
 * settings already say, but producing it starts auth, which reads the database, and anyone may ask.
 */
function remembered(name: string, produce: () => (request: Request) => Promise<Response>) {
  const read = unstable_cache(async (origin: string) => (await produce()(new Request(`${origin}/.well-known/${name}`))).json(), [name], { revalidate: A_WEEK_IN_SECONDS })
  return async () => Response.json(await read(publicUrl()), { headers: { 'cache-control': 'public, max-age=15, stale-while-revalidate=15, stale-if-error=86400' } })
}

export const serveAuthServerMetadata = remembered('oauth-authorization-server', () => oauthProviderAuthServerMetadata(auth()))
export const serveOpenIdConfig = remembered('openid-configuration', () => oauthProviderOpenIdConfigMetadata(auth()))
