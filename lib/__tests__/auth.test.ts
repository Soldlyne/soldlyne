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
  it('refuses an address not on the list with a code and a message, not a pretend success', async () => {
    const response = await signUp(createAuth(SETTINGS), `stranger@${tag}.example`)
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ code: 'SIGN_UP_REFUSED', message: 'This address has no access to Soldlyne.' })
    expect(mails).toEqual([])
    expect(await trustedPrisma.user.count({ where: { email: `stranger@${tag}.example` } })).toBe(0)
  })

  it('refuses everyone when mail is not set up, since nobody could confirm', async () => {
    const response = await signUp(createAuth({ ...SETTINGS, RESEND_API_KEY: undefined }), listed)
    expect(response.status).toBe(422)
    expect((await response.json()).message).toContain('confirmation link')
    expect(await trustedPrisma.user.count({ where: { email: listed } })).toBe(0)
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
