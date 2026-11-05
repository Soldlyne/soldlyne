import 'server-only'
import { canSendOwnMail } from './mail'

/** The part of the environment sign-in reads; passed in, so each rule can be tried with any install's settings. */
export type SignInSettings = {
  [key: string]: string | undefined
  OIDC_ISSUER?: string
  OIDC_CLIENT_ID?: string
  OIDC_CLIENT_SECRET?: string
  OIDC_NAME?: string
  SOLDLYNE_PASSWORD_SIGN_IN?: string
  SOLDLYNE_ADMINS?: string
  RESEND_API_KEY?: string
  SOLDLYNE_MAIL_FROM?: string
}

/** A company's identity provider, as Better Auth knows it: members come back to /api/auth/callback/oidc. */
const COMPANY_PROVIDER = 'oidc'

/** The company's identity provider (any OpenID Connect server), when all of it is set. */
export function companyLogin(settings: SignInSettings) {
  const { OIDC_ISSUER: issuer, OIDC_CLIENT_ID: clientId, OIDC_CLIENT_SECRET: clientSecret } = settings
  if (!issuer || !clientId || !clientSecret) return null
  return {
    providerId: COMPANY_PROVIDER,
    discoveryUrl: `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`,
    clientId,
    clientSecret,
    scopes: ['openid', 'profile', 'email'],
    // Basic is OpenID Connect's default for a client with a secret: a server may refuse any other method for it.
    authentication: 'basic' as const,
    pkce: true,
    overrideUserInfo: true,
  }
}

export type SignInMethods = { provider: { id: string; name: string } | null; passwords: boolean }

/** The ways into this install: its company's provider alone when it has one, otherwise passwords if they are on. */
export function signInOf(settings: SignInSettings): SignInMethods {
  if (companyLogin(settings)) return { provider: { id: COMPANY_PROVIDER, name: settings.OIDC_NAME || 'SSO' }, passwords: false }
  return { provider: null, passwords: settings.SOLDLYNE_PASSWORD_SIGN_IN === 'true' }
}

/** Whether this address is on the install's list: it may get an account without an invitation, and start workspaces. An empty list means nobody. */
export function isAdmin(email: string, settings: SignInSettings): boolean {
  return (settings.SOLDLYNE_ADMINS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.trim().toLowerCase())
}

/**
 * Whether a provider's account may be created: someone on the list, or with an invitation still good.
 * Both go by the address, so the provider must have verified it: an identity server may let anyone
 * type any address.
 */
export const mayJoin = (person: { email: string; emailVerified?: boolean | null }, settings: SignInSettings, invited = false) => person.emailVerified === true && (invited || isAdmin(person.email, settings))

/**
 * Why an account can't be created with a password, if it can't. The address isn't proved yet: the
 * link mailed afterwards proves it and sign-in stays closed until then, so without mail nobody could ever get in.
 */
export function passwordSignUpRefusal(email: string, settings: SignInSettings, invited = false): string | null {
  if (!invited && !isAdmin(email, settings)) return 'This address has no access to Soldlyne.'
  return canSendOwnMail(settings) ? null : "Soldlyne can't send the confirmation link yet: try again later."
}

const IGNORE_IT = "If you didn't ask for this, ignore this message."

/** The mails that prove an address is someone's: the link is the proof, so nothing else may be needed to use it. */
export const accountMail = {
  confirm: (url: string) => ({ subject: 'Confirm your address for Soldlyne', text: `Hello,\n\nTo activate your Soldlyne account, open this link:\n${url}\n\n${IGNORE_IT} No account will be activated.` }),
  reset: (url: string) => ({ subject: 'Your Soldlyne password', text: `Hello,\n\nTo choose a new password, open this link:\n${url}\n\n${IGNORE_IT} Your password won't change.` }),
}
