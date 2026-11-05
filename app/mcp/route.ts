import { createMcpHandler } from '@modelcontextprotocol/server'
import { memberOfToken } from '@/lib/auth'
import { soldlyneServer } from '@/lib/mcp/server'
import { publicUrl } from '@/lib/public-url'
import { workspacesOf } from '@/lib/workspaces/workspaces'
import { answerInFull } from './answer-in-full'

export const maxDuration = 60

/** Where an assistant learns how to sign in, per the MCP authorization spec (RFC 9728). */
const resourceMetadataUrl = () => `${publicUrl()}/.well-known/oauth-protected-resource/mcp`

function unauthorized(detail: string): Response {
  return Response.json(
    { error: 'unauthorized', error_description: detail },
    { status: 401, headers: { 'WWW-Authenticate': `Bearer resource_metadata="${resourceMetadataUrl()}"`, 'Access-Control-Expose-Headers': 'WWW-Authenticate' } },
  )
}

type Asker = { userId: string; clientId: string; workspaces: Awaited<ReturnType<typeof workspacesOf>> }

const handler = createMcpHandler(({ authInfo }) => soldlyneServer(authInfo?.extra as Asker))

/**
 * The MCP endpoint. Each request is verified on its own, its member's workspaces read again, and
 * served by a fresh server that knows only those, so someone taken out of a workspace is out of it on
 * their next call, and nothing about one member can reach another's tools.
 */
async function serve(request: Request): Promise<Response> {
  const member = await memberOfToken(request).catch(() => null)
  if (!member) return unauthorized('Sign in to Soldlyne to use this server.')
  const workspaces = await workspacesOf(member.userId)
  // Not a 401: signing in again wouldn't help, and an assistant would loop on it.
  if (workspaces.length === 0) return Response.json({ error: 'no_workspace', error_description: `Join or create a workspace first: ${publicUrl()}/welcome` }, { status: 403 })
  const token = request.headers.get('authorization')?.split(' ')[1] ?? ''
  const extra: Asker = { ...member, workspaces }
  return answerInFull(request, (whole) => handler.fetch(whole, { authInfo: { token, clientId: member.clientId, scopes: [], extra } }))
}

export const GET = serve
export const POST = serve
export const DELETE = serve
