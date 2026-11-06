import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { hashPassword } from 'better-auth/crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createBareWorkspace, createUser, removeUsers, removeWorkspace } from '@/test/fixtures'

const { trustedPrisma } = await import('@/lib/trusted-prisma')
const { createAuth } = await import('../auth')
const { removeMember } = await import('@/lib/workspaces/team')
const { whereAccessGoes } = await import('../consent')
const { POST: mcpRoute } = await import('@/app/api/mcp/route')

const ORIGIN = 'http://localhost:3100'
const MCP_URL = `${ORIGIN}/api/mcp`
const REDIRECT_URI = 'http://localhost:3118/callback'
const tag = `oauth-${Date.now()}`
const MEMBER = `member@${tag}.example`
const PASSWORD = 'correct horse battery'

type TokenAnswer = { access_token: string; refresh_token: string; error?: string }

let auth: ReturnType<typeof createAuth>
let workspaceId = ''
const clientIds: string[] = []

const postJson = (path: string, body: object, cookie = '') =>
  auth.handler(new Request(`${ORIGIN}/api/auth${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, cookie }, body: JSON.stringify(body) }))

async function requestTokens(fields: Record<string, string>) {
  const response = await auth.handler(new Request(`${ORIGIN}/api/auth/oauth2/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams(fields) }))
  return { status: response.status, body: (await response.json()) as TokenAnswer }
}

/** A refresh grant with the same fields MCP clients send. */
const refresh = (clientId: string, refreshToken: string) => requestTokens({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId, resource: MCP_URL })

async function registerClient(): Promise<string> {
  const response = await postJson('/oauth2/register', { client_name: 'An assistant', redirect_uris: [REDIRECT_URI], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' })
  const { client_id: clientId } = await response.json()
  clientIds.push(clientId)
  return clientId
}

async function signIn(): Promise<string> {
  const response = await postJson('/sign-in/email', { email: MEMBER, password: PASSWORD })
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ')
}

/** A member signs in, opens the assistant's link and approves it: the code comes back on the assistant's address. */
async function approve(clientId: string, codeChallenge: string): Promise<string> {
  const cookie = await signIn()
  const query = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: REDIRECT_URI, state: 'a-state', scope: 'openid profile email offline_access', prompt: 'consent', code_challenge: codeChallenge, code_challenge_method: 'S256', resource: MCP_URL })
  const opened = await auth.handler(new Request(`${ORIGIN}/api/auth/oauth2/authorize?${query}`, { headers: { cookie, accept: 'text/html' } }))
  const consentPage = new URL(opened.headers.get('location') ?? (await opened.json()).url, ORIGIN)
  // The consent screen says where the access goes from this: it has to arrive in the signed address.
  expect(whereAccessGoes(consentPage.searchParams.get('redirect_uri'))).toBe(new URL(REDIRECT_URI).host)
  const answer = await postJson('/oauth2/consent', { accept: true, oauth_query: consentPage.search.slice(1) }, cookie)
  const { url } = await answer.json()
  return new URL(url).searchParams.get('code')!
}

/** The whole of connecting, as an MCP client does it: it registers, a member approves it, and it trades the code with PKCE. */
async function connect() {
  const clientId = await registerClient()
  const verifier = randomBytes(32).toString('base64url')
  const code = await approve(clientId, createHash('sha256').update(verifier).digest('base64url'))
  const { body: tokens } = await requestTokens({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: REDIRECT_URI, client_id: clientId, resource: MCP_URL })
  return { clientId, tokens }
}

/** What /api/mcp says to this access token when asked for its tools. */
async function listTools(accessToken: string) {
  const response = await mcpRoute(new Request(MCP_URL, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18', authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }) }))
  return { status: response.status, text: await response.text() }
}

const expectGoodOnMcp = async (accessToken: string) => {
  const { status, text } = await listTools(accessToken)
  expect(status).toBe(200)
  expect(text).toContain('create_deal')
}

beforeAll(async () => {
  vi.stubEnv('BETTER_AUTH_URL', ORIGIN)
  // The install's own when it has one: it seals the signing key a local database already holds.
  vi.stubEnv('BETTER_AUTH_SECRET', process.env.BETTER_AUTH_SECRET || 'a'.repeat(32))
  auth = createAuth({ SOLDLYNE_PASSWORD_SIGN_IN: 'true', SOLDLYNE_ADMINS: MEMBER })
  // /api/mcp checks a token against the signing keys at their address: here, the handler itself.
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => auth.handler(new Request(input, init)))
  const user = await createUser(MEMBER)
  const now = new Date()
  await trustedPrisma.account.create({ data: { id: randomUUID(), accountId: user.id, providerId: 'credential', userId: user.id, password: await hashPassword(PASSWORD), createdAt: now, updatedAt: now } })
  workspaceId = (await createBareWorkspace(tag)).id
  await trustedPrisma.member.create({ data: { workspaceId, userId: user.id, role: 'OWNER' } })
})

afterAll(async () => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  await trustedPrisma.oauthClient.deleteMany({ where: { clientId: { in: clientIds } } })
  await removeWorkspace(workspaceId)
  await removeUsers(`@${tag}.example`)
})

describe("an assistant whose member is taken out of the workspace", () => {
  it('loses access on its next call, with the same token, and gets it back if they return', async () => {
    const { tokens } = await connect()
    await expectGoodOnMcp(tokens.access_token)
    const other = await createUser(`other-owner@${tag}.example`)
    await trustedPrisma.member.create({ data: { workspaceId, userId: other.id, role: 'OWNER' } })
    const { id: memberId } = await trustedPrisma.user.findUniqueOrThrow({ where: { email: MEMBER } })
    expect(await removeMember(workspaceId, other.id, memberId)).toEqual({ ok: true })
    const refused = await listTools(tokens.access_token)
    expect(refused.status).toBe(403)
    expect(refused.text).toContain('no_workspace')
    expect(refused.text).not.toContain('create_deal')
    await trustedPrisma.member.create({ data: { workspaceId, userId: memberId, role: 'OWNER' } })
    await trustedPrisma.member.deleteMany({ where: { workspaceId, userId: other.id } })
    await expectGoodOnMcp(tokens.access_token)
  })
})

describe('an assistant keeping its connection', () => {
  it('refreshes twice in a row, each access token good on /api/mcp', async () => {
    const { clientId, tokens } = await connect()
    await expectGoodOnMcp(tokens.access_token)

    const first = await refresh(clientId, tokens.refresh_token)
    expect(first.status).toBe(200)
    expect(first.body.refresh_token).not.toBe(tokens.refresh_token)
    await expectGoodOnMcp(first.body.access_token)

    const second = await refresh(clientId, first.body.refresh_token)
    expect(second.status).toBe(200)
    expect(second.body.refresh_token).not.toBe(first.body.refresh_token)
    await expectGoodOnMcp(second.body.access_token)
  })

  it('stays connected when its token store loses an answer and it presents the old token again', async () => {
    const { clientId, tokens } = await connect()
    const lost = await refresh(clientId, tokens.refresh_token)

    const again = await refresh(clientId, tokens.refresh_token)
    expect(again.status).toBe(200)
    expect(again.body.refresh_token).toBe(lost.body.refresh_token)
    await expectGoodOnMcp(again.body.access_token)

    const next = await refresh(clientId, again.body.refresh_token)
    expect(next.status).toBe(200)
    await expectGoodOnMcp(next.body.access_token)
  })

  it('is cut off when a replaced token comes back after the grace: that reads as a stolen token', async () => {
    const { clientId, tokens } = await connect()
    const rotated = await refresh(clientId, tokens.refresh_token)
    await trustedPrisma.oauthRefreshToken.updateMany({ where: { clientId, revoked: { not: null } }, data: { rotationReplayExpiresAt: new Date(Date.now() - 1000) } })

    const late = await refresh(clientId, tokens.refresh_token)
    expect(late.status).toBe(400)
    expect(late.body.error).toBe('invalid_grant')
    expect((await refresh(clientId, rotated.body.refresh_token)).body.error).toBe('invalid_grant')
  })
})
