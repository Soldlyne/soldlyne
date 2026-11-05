import { mcpResource, tokenIssuer } from '@/lib/auth'

/**
 * What an assistant reads after a 401 from /api/mcp (RFC 9728): the resource it is reaching, and which
 * server signs tokens for it. The issuer is Better Auth's, under its base path. Nothing here builds
 * auth, so a client finding its way doesn't wake the database.
 */
export function GET() {
  return Response.json({
    resource: mcpResource(),
    authorization_servers: [tokenIssuer()],
    bearer_methods_supported: ['header'],
    scopes_supported: ['openid', 'profile', 'email', 'offline_access'],
    resource_name: 'Soldlyne',
  })
}
