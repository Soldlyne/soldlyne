import { decryptOAuthToken, setTokenUtil } from 'better-auth/oauth2'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { trustedPrisma } = await import('@/lib/trusted-prisma')
const { createAuth } = await import('../auth')

const ORIGIN = 'http://localhost:3100'
const tag = `auth-${Date.now()}`
const listed = `founder@${tag}.example`
const SETTINGS = { SOLDLYNE_PASSWORD_SIGN_IN: 'true', SOLDLYNE_ADMINS: listed, RESEND_API_KEY: 'key', SOLDLYNE_MAIL_FROM: 'Soldlyne <soldlyne@example.com>' }
const PASSWORD = 'correct horse battery'

let mails: { to: string[]; text: string }[] = []

const post = (auth: ReturnType<typeof createAuth>, path: string, body: object) =>
  auth.handler(new Request(`${ORIGIN}/api/auth${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: JSON.stringify(body) }))

const signUp = (auth: ReturnType<typeof createAuth>, email: string) => post(auth, '/sign-up/email', { email, password: PASSWORD, name: 'Camille' })

beforeEach(() => {
  mails = []
  vi.stubEnv('BETTER_AUTH_URL', ORIGIN)
  vi.stubEnv('BETTER_AUTH_SECRET', 'a'.repeat(32))
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    mails.push(JSON.parse(String(init.body)))
    return new Response('{"id":"1"}')
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

afterAll(async () => {
  await trustedPrisma.user.deleteMany({ where: { email: { endsWith: `@${tag}.example` } } })
  await trustedPrisma.verification.deleteMany({ where: { identifier: { contains: tag } } })
})

describe('password sign-up', () => {
  it('answers an address not on the list as it answers one that is, so the answer says nothing about either, and creates nothing', async () => {
    const other = `other-founder@${tag}.example`
    const auth = createAuth({ ...SETTINGS, SOLDLYNE_ADMINS: other })
    const [stranger, allowed] = [await signUp(auth, `stranger@${tag}.example`), await signUp(auth, other)]
    expect(stranger.status).toBe(allowed.status)
    expect(stranger.status).toBe(200)
    const [theirs, ours] = [await stranger.json(), await allowed.json()]
    expect(Object.keys(theirs).sort()).toEqual(Object.keys(ours).sort())
    expect(Object.keys(theirs.user).sort()).toEqual(Object.keys(ours.user).sort())
    expect(mails.map((mail) => mail.to)).toEqual([[other]])
    expect(await trustedPrisma.user.count({ where: { email: `stranger@${tag}.example` } })).toBe(0)
  })

  it('says the same to everyone when mail is not set up, since nobody could confirm', async () => {
    const auth = createAuth({ ...SETTINGS, RESEND_API_KEY: undefined })
    for (const email of [listed, `stranger-no-mail@${tag}.example`]) {
      const response = await signUp(auth, email)
      expect(response.status).toBe(422)
      expect(await response.json()).toMatchObject({ code: 'SIGN_UP_REFUSED', message: expect.stringContaining('confirmation link') })
      expect(await trustedPrisma.user.count({ where: { email } })).toBe(0)
    }
  })

  it('keeps a listed address out until its mailed link is opened', async () => {
    const auth = createAuth(SETTINGS)
    expect((await signUp(auth, listed)).status).toBe(200)
    expect(mails.map((mail) => mail.to)).toEqual([[listed]])

    const early = await post(auth, '/sign-in/email', { email: listed, password: PASSWORD })
    expect(early.status).toBe(403)
    expect((await early.json()).code).toBe('EMAIL_NOT_VERIFIED')

    const link = mails[0].text.match(/https?:\/\/\S+/)![0]
    const opened = await auth.handler(new Request(link, { headers: { origin: ORIGIN } }))
    expect(opened.status).toBe(302)
    expect((await trustedPrisma.user.findUniqueOrThrow({ where: { email: listed } })).emailVerified).toBe(true)
    expect((await post(auth, '/sign-in/email', { email: listed, password: PASSWORD })).status).toBe(200)
  })
})

describe('accounts from a provider', () => {
  const before = (auth: ReturnType<typeof createAuth>) => auth.options.databaseHooks!.user!.create!.before!

  it('refuses without an error, so the callback redirects to the login page instead of showing JSON', async () => {
    const user = { email: `stranger@${tag}.example`, emailVerified: true }
    await expect(before(createAuth(SETTINGS))(user as never, { path: '/callback/oidc' } as never)).resolves.toBe(false)
  })

  it('lets a listed address in once the provider has verified it', async () => {
    const refused = await before(createAuth(SETTINGS))({ email: listed, emailVerified: false } as never, { path: '/callback/oidc' } as never)
    expect(refused).toBe(false)
    const allowed = await before(createAuth(SETTINGS))({ email: listed, emailVerified: true } as never, { path: '/callback/oidc' } as never)
    expect(allowed).toBeUndefined()
  })
})

describe('the tokens a provider gives at sign-in', () => {
  it("are sealed before they're kept, and read back", async () => {
    const context = (await createAuth(SETTINGS).$context) as never
    const sealed = await setTokenUtil('ya29.a-provider-token', context)
    expect(sealed).not.toContain('a-provider-token')
    expect(await decryptOAuthToken(sealed as string, context)).toBe('ya29.a-provider-token')
  })

  it('still read when a row was stored before they were sealed', async () => {
    expect(await decryptOAuthToken('ya29.stored-in-clear', (await createAuth(SETTINGS).$context) as never)).toBe('ya29.stored-in-clear')
  })
})
