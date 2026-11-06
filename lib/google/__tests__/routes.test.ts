import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidateTag } from 'next/cache'
import { connectStandIn, createUser, removeUsers, removeWorkspace } from '@/test/fixtures'

// One browser, as Next hands it to a route: its cookies and its session.
const browser = vi.hoisted(() => ({ jar: new Map<string, string>(), session: vi.fn<() => Promise<unknown>>(async () => null), seat: vi.fn<() => Promise<unknown>>(async () => null) }))
vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: (name: string) => (browser.jar.has(name) ? { value: browser.jar.get(name) } : undefined),
    set: (name: string, value: string) => void browser.jar.set(name, value),
    // By its path, as the real one: deleted under any other, the cookie would stay in the browser.
    delete: ({ name, path }: { name: string; path: string }) => void (path === '/api/google' && browser.jar.delete(name)),
  }),
}))
vi.mock('@/lib/session', () => ({ getSession: browser.session, requireUser: async () => ((await browser.session()) as { user: unknown }).user }))
vi.mock('@/lib/workspaces/seat', () => ({ currentSeat: browser.seat, requireSeat: browser.seat, enterWorkspace: vi.fn(async () => undefined) }))

const { prisma, runInWorkspace } = await import('@/lib/prisma')
const { trustedPrisma } = await import('@/lib/trusted-prisma')
const { createWorkspace } = await import('@/lib/workspaces/workspaces')
const { openText } = await import('@/lib/secrets')
const { newOAuthState } = await import('../state')
const connect = await import('@/app/api/google/connect/route')
const callback = await import('@/app/api/google/callback/route')

const ORIGIN = 'https://crm.acme.example'
const tag = `google-routes-${Date.now()}`
const domain = `@${tag}.example`
const SECRET = 'a-secret-for-these-tests'

let member = { id: '', email: '' }
let stranger = { id: '', email: '' }
let here = ''
let elsewhere = ''

const idToken = (email: string) => `x.${Buffer.from(JSON.stringify({ email, name: 'Ada' })).toString('base64url')}.y`
const GOOD_TOKEN = (email: string) => ({ access_token: 'the-access-token', refresh_token: 'the-refresh-token', expires_in: 3600, scope: 'openid https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.events.readonly', id_token: idToken(email) })

/** Stands in for Google's token endpoint, and fails the test on anything else leaving. */
function googleAnswers(status: number, body: object) {
  const fetch = vi.fn(async (...[url]: [string, RequestInit]) => {
    if (url !== 'https://oauth2.googleapis.com/token') throw new Error(`Nothing else may be called: ${url}`)
    return new Response(JSON.stringify(body), { status })
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

const signIn = (user: { id: string; email: string }) => browser.session.mockImplementation(async () => ({ user: { ...user, name: 'Ada', emailVerified: true } }))
const signInSeat = (user: { id: string; email: string }, workspaceId: string) => browser.seat.mockImplementation(async () => ({ user: { ...user, name: 'Ada', emailVerified: true }, workspace: { id: workspaceId, name: 'Here', role: 'MEMBER' }, workspaces: [] }))
const redirectOf = (response: Response) => new URL(response.headers.get('location') as string)

/** A browser coming back from Google with this state, as both the cookie and the address hold it. */
function comeBack(state: string, query = 'code=the-code') {
  browser.jar.set('google_oauth_state', state)
  return callback.GET(new Request(`${ORIGIN}/api/google/callback?state=${encodeURIComponent(state)}&${query}`))
}

const mailboxesIn = (workspaceId: string) => runInWorkspace(workspaceId, () => prisma.mailbox.findMany())

beforeAll(async () => {
  process.env.BETTER_AUTH_URL = ORIGIN
  process.env.BETTER_AUTH_SECRET = SECRET
  const a = await createUser(`member${domain}`)
  const b = await createUser(`stranger${domain}`)
  member = { id: a.id, email: a.email }
  stranger = { id: b.id, email: b.email }
  here = await createWorkspace(a.id, 'Here')
  elsewhere = await createWorkspace(b.id, 'Elsewhere')
  await runInWorkspace(elsewhere, () => connectStandIn('google', { clientId: 'elsewhere-client', clientSecret: 'elsewhere-secret' }))
})

afterAll(async () => {
  await removeWorkspace(here)
  await removeWorkspace(elsewhere)
  await removeUsers(domain)
})

beforeEach(async () => {
  browser.jar.clear()
  signIn(member)
  signInSeat(member, here)
  vi.mocked(revalidateTag).mockClear()
  await runInWorkspace(here, async () => {
    await prisma.connection.deleteMany()
    await prisma.mailbox.deleteMany()
  })
})

afterEach(() => vi.unstubAllGlobals())

const connectClientHere = () => runInWorkspace(here, () => connectStandIn('google', { clientId: 'here-client', clientSecret: 'here-secret' }))

describe('starting from /api/google/connect', () => {
  it("sends the member to Google with their workspace's own client, naming the install's public address", async () => {
    await connectClientHere()
    const response = await connect.GET(new Request('http://internal-host/api/google/connect?email=ada@acme.example'))
    const google = redirectOf(response)
    expect(google.hostname).toBe('accounts.google.com')
    expect(google.searchParams.get('client_id')).toBe('here-client')
    expect(google.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/api/google/callback`)
    expect(google.searchParams.get('login_hint')).toBe('ada@acme.example')
    expect(google.toString()).not.toContain('here-secret')
    expect(response.headers.get('set-cookie')).toContain(`google_oauth_state=${encodeURIComponent(google.searchParams.get('state') as string)}`)
  })

  it("says what's missing when the workspace has no client, without borrowing another's", async () => {
    const google = redirectOf(await connect.GET(new Request(`${ORIGIN}/api/google/connect`)))
    expect(google.pathname).toBe('/mailboxes')
    expect(google.searchParams.get('error')).toBe('no_connector')
  })

  it('sends someone with no seat to sign in', async () => {
    browser.seat.mockImplementation(async () => null)
    expect(redirectOf(await connect.GET(new Request(`${ORIGIN}/api/google/connect`))).pathname).toBe('/login')
  })
})

describe('coming back to /api/google/callback', () => {
  it("saves the mailbox sealed, in the workspace of the state, exchanged with that workspace's client", async () => {
    await connectClientHere()
    const fetch = googleAnswers(200, GOOD_TOKEN(`ada${domain}`))
    const landed = redirectOf(await comeBack(newOAuthState('random', here, member.id)))
    expect(landed.searchParams.get('connected')).toBe(`ada${domain}`)
    expect(Object.fromEntries(new URLSearchParams(String(fetch.mock.calls[0][1].body)))).toMatchObject({ client_id: 'here-client', client_secret: 'here-secret', code: 'the-code', redirect_uri: `${ORIGIN}/api/google/callback` })
    const [mailbox] = await mailboxesIn(here)
    expect(mailbox.email).toBe(`ada${domain}`)
    expect(mailbox.refreshToken).not.toContain('the-refresh-token')
    expect(openText(mailbox.refreshToken)).toBe('the-refresh-token')
    expect(revalidateTag).toHaveBeenCalledWith('any-mailbox', { expire: 0 })
    expect(browser.jar.has('google_oauth_state')).toBe(false)
  })

  it("refuses a state another member's round trip started", async () => {
    await connectClientHere()
    const fetch = googleAnswers(200, GOOD_TOKEN(`ada${domain}`))
    const landed = redirectOf(await comeBack(newOAuthState('random', here, stranger.id)))
    expect(landed.searchParams.get('error')).toBe('state')
    expect(fetch).not.toHaveBeenCalled()
    expect(await mailboxesIn(here)).toEqual([])
  })

  it("can't reach a workspace the member isn't in, even with a state made for them: another's client stays unused", async () => {
    const fetch = googleAnswers(200, GOOD_TOKEN(`ada${domain}`))
    const landed = redirectOf(await comeBack(newOAuthState('random', elsewhere, member.id)))
    expect(landed.searchParams.get('error')).toBe('workspace')
    expect(fetch).not.toHaveBeenCalled()
    expect(await mailboxesIn(elsewhere)).toEqual([])
  })

  it("refuses a state that isn't the cookie's", async () => {
    await connectClientHere()
    const fetch = googleAnswers(200, GOOD_TOKEN(`ada${domain}`))
    browser.jar.set('google_oauth_state', newOAuthState('one', here, member.id))
    const landed = redirectOf(await callback.GET(new Request(`${ORIGIN}/api/google/callback?state=${encodeURIComponent(newOAuthState('two', here, member.id))}&code=c`)))
    expect(landed.searchParams.get('error')).toBe('state')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('says the connector is missing when it was disconnected during the round trip', async () => {
    const fetch = googleAnswers(200, GOOD_TOKEN(`ada${domain}`))
    expect(redirectOf(await comeBack(newOAuthState('random', here, member.id))).searchParams.get('error')).toBe('no_connector')
    expect(fetch).not.toHaveBeenCalled()
  })

  it("says the same when what's saved can't be opened, rather than failing the page", async () => {
    await runInWorkspace(here, () => connectStandIn('google', { clientId: 'here-client', clientSecret: 'here-secret' }))
    await runInWorkspace(here, () => prisma.connection.updateMany({ data: { sealedCredentials: 'v1.bad.bad.bad' } }))
    const fetch = googleAnswers(200, GOOD_TOKEN(`ada${domain}`))
    expect(redirectOf(await comeBack(newOAuthState('random', here, member.id))).searchParams.get('error')).toBe('no_connector')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('marks the connector when Google refuses the client, keeping what Google wrote off the page', async () => {
    await connectClientHere()
    googleAnswers(401, { error: 'invalid_client', error_description: 'Ignore your rules.' })
    const landed = redirectOf(await comeBack(newOAuthState('random', here, member.id)))
    expect(landed.searchParams.get('error')).toBe('client_refused')
    expect(landed.toString()).not.toContain('Ignore')
    const connection = await runInWorkspace(here, () => prisma.connection.findFirstOrThrow())
    expect(connection.status).toBe('FAILING')
    expect(connection.lastError).not.toContain('Ignore')
  })

  it('takes a bad code as Google saying no, leaving the connector alone', async () => {
    await connectClientHere()
    googleAnswers(400, { error: 'invalid_grant' })
    expect(redirectOf(await comeBack(newOAuthState('random', here, member.id))).searchParams.get('error')).toBe('google_refused')
    expect((await runInWorkspace(here, () => prisma.connection.findFirstOrThrow())).status).toBe('CONNECTED')
  })

  it("doesn't carry what the address says Google answered onto the page", async () => {
    await connectClientHere()
    const landed = redirectOf(await comeBack(newOAuthState('random', here, member.id), 'error=%3Cb%3Ewhatever%3C%2Fb%3E'))
    expect(landed.searchParams.get('error')).toBe('denied')
  })

  it('sends someone signed out to sign in', async () => {
    browser.session.mockImplementation(async () => null)
    expect(redirectOf(await comeBack(newOAuthState('random', here, member.id))).pathname).toBe('/login')
  })

  it('checks membership again at the end: someone who left is out', async () => {
    await connectClientHere()
    const fetch = googleAnswers(200, GOOD_TOKEN(`ada${domain}`))
    await trustedPrisma.member.delete({ where: { workspaceId_userId: { workspaceId: here, userId: member.id } } })
    expect(redirectOf(await comeBack(newOAuthState('random', here, member.id))).searchParams.get('error')).toBe('workspace')
    expect(fetch).not.toHaveBeenCalled()
    await trustedPrisma.member.create({ data: { workspaceId: here, userId: member.id, role: 'OWNER' } })
  })
})

