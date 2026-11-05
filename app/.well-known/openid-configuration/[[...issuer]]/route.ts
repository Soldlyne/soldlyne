import { serveOpenIdConfig } from '@/lib/oauth-discovery'

/** The same discovery for clients that look for OpenID's document. */
export const GET = serveOpenIdConfig
