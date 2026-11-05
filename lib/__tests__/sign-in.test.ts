import { describe, expect, it } from 'vitest'
import { accountMail, companyLogin, isAdmin, mayJoin, passwordSignUpRefusal, signInOf } from '../sign-in'

const COMPANY = { OIDC_ISSUER: 'https://auth.example.com/api/auth', OIDC_CLIENT_ID: 'client', OIDC_CLIENT_SECRET: 'secret', OIDC_NAME: 'Acme' }
const MAIL = { RESEND_API_KEY: 'key', SOLDLYNE_MAIL_FROM: 'Soldlyne <soldlyne@example.com>' }
const ADMINS = { SOLDLYNE_ADMINS: 'founder@example.com, Partner@example.com' }

describe('the ways into an install', () => {
  it('offers nothing until one is set up', () => {
    expect(signInOf({})).toEqual({ provider: null, passwords: false })
    expect(signInOf({ OIDC_ISSUER: '', OIDC_CLIENT_ID: '', OIDC_CLIENT_SECRET: '', SOLDLYNE_PASSWORD_SIGN_IN: 'false' })).toEqual({ provider: null, passwords: false })
    expect(companyLogin({})).toBeNull()
  })

  it('offers passwords when they are on', () => {
    expect(signInOf({ SOLDLYNE_PASSWORD_SIGN_IN: 'true' })).toEqual({ provider: null, passwords: true })
  })

  it("offers only the company's provider when it has one, under its name, whatever else is set", () => {
    expect(signInOf({ ...COMPANY, SOLDLYNE_PASSWORD_SIGN_IN: 'true' })).toEqual({ provider: { id: 'oidc', name: 'Acme' }, passwords: false })
    expect(companyLogin(COMPANY)).toMatchObject({
      providerId: 'oidc',
      discoveryUrl: 'https://auth.example.com/api/auth/.well-known/openid-configuration',
      clientId: 'client',
      scopes: ['openid', 'profile', 'email'],
      authentication: 'basic',
    })
  })

  it('names a provider that has no name, and reads an issuer with a trailing slash', () => {
    expect(signInOf({ ...COMPANY, OIDC_NAME: '' }).provider?.name).toBe('SSO')
    expect(companyLogin({ ...COMPANY, OIDC_ISSUER: 'https://auth.example.com/' })?.discoveryUrl).toBe('https://auth.example.com/.well-known/openid-configuration')
  })

  it.each(['OIDC_ISSUER', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET'])("needs %s to use a company's provider", (missing) => {
    expect(companyLogin({ ...COMPANY, [missing]: undefined })).toBeNull()
  })
})

describe('who may get an account', () => {
  it('goes by the list, whatever the case and the spaces', () => {
    expect(isAdmin('FOUNDER@example.com', ADMINS)).toBe(true)
    expect(isAdmin(' partner@example.com ', ADMINS)).toBe(true)
    expect(isAdmin('stranger@example.com', ADMINS)).toBe(false)
  })

  it.each([{}, { SOLDLYNE_ADMINS: '' }, { SOLDLYNE_ADMINS: ' , ' }])('lets nobody in on an empty list: %o', (settings) => {
    expect(isAdmin('founder@example.com', settings)).toBe(false)
    expect(isAdmin('', settings)).toBe(false)
  })

  it('lets a listed address in through a provider once the provider has verified it', () => {
    expect(mayJoin({ email: 'Founder@example.com', emailVerified: true }, ADMINS)).toBe(true)
  })

  it.each([false, null, undefined])('refuses a listed address its provider marks %s: anyone could have typed it', (emailVerified) => {
    expect(mayJoin({ email: 'founder@example.com', emailVerified }, ADMINS)).toBe(false)
  })

  it('refuses an address not on the list', () => {
    expect(mayJoin({ email: 'stranger@example.com', emailVerified: true }, ADMINS)).toBe(false)
    expect(passwordSignUpRefusal('stranger@example.com', { ...ADMINS, ...MAIL })).toContain('no access')
  })

  it('lets an invited address join through a provider once verified, and with a password, though not on the list', () => {
    expect(mayJoin({ email: 'invited@example.com', emailVerified: true }, ADMINS, true)).toBe(true)
    expect(mayJoin({ email: 'invited@example.com', emailVerified: false }, ADMINS, true)).toBe(false)
    expect(passwordSignUpRefusal('invited@example.com', { ...ADMINS, ...MAIL }, true)).toBeNull()
    expect(passwordSignUpRefusal('invited@example.com', { ...ADMINS, RESEND_API_KEY: 'key' }, true)).toContain('confirmation link')
  })

  it('lets a listed address sign up with a password only if the link proving it can be mailed', () => {
    expect(passwordSignUpRefusal('founder@example.com', { ...ADMINS, ...MAIL })).toBeNull()
    expect(passwordSignUpRefusal('founder@example.com', { ...ADMINS, RESEND_API_KEY: 'key' })).toContain('confirmation link')
    expect(passwordSignUpRefusal('founder@example.com', { ...ADMINS, SOLDLYNE_MAIL_FROM: 'a@example.com' })).toContain('confirmation link')
  })
})

describe('the mails that prove an address', () => {
  it.each([
    ['confirm', accountMail.confirm],
    ['reset', accountMail.reset],
  ])('%s carries the link, and tells a stranger to ignore it', (_, mail) => {
    const { subject, text } = mail('https://soldlyne.test/link')
    expect(subject).toContain('Soldlyne')
    expect(text).toContain('https://soldlyne.test/link')
    expect(text).toContain('ignore this message')
  })
})
