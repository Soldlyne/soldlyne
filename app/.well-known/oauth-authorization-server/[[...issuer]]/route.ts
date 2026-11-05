import { serveAuthServerMetadata } from '@/lib/oauth-discovery'

/** How an assistant finds Soldlyne's OAuth endpoints (RFC 8414), at the root and under the issuer's path. */
export const GET = serveAuthServerMetadata
