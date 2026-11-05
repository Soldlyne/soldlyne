import 'server-only'
import { oauthProvider } from '@better-auth/oauth-provider'
import { betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { genericOAuth, jwt } from 'better-auth/plugins'
import { nextCookies } from 'better-auth/next-js'
import { requestToResourceInput, verifyAccessTokenRequest } from 'better-auth/oauth2'
import { sendOwnMail } from './mail'
import { publicUrl } from './public-url'
import { accountMail, companyLogin, isAdmin, mayJoin, passwordSignUpRefusal, signInOf, type SignInSettings } from './sign-in'
import { SIGN_UP_REFUSED } from './sign-up-refused'
import { trustedPrisma } from './trusted-prisma'
import { hasLiveInvitation } from './workspaces/invitation-gate'

const PASSWORD_SIGN_UP = '/sign-up/email'

/** The MCP server's address: the only audience the assistants' tokens are good for. */
export const mcpResource = () => `${publicUrl()}/api/mcp`

/** Who signs tokens: Better Auth, under its base path. */
export const tokenIssuer = () => `${publicUrl()}/api/auth`

const OAUTH_SCOPES = ['openid', 'profile', 'email', 'offline_access']

/**
 * Members sign in with the company's identity provider when the install has one, otherwise with a
 * password if it allows them. Either way, only the addresses in SOLDLYNE_ADMINS and those with an
 * invitation still good may get an account. Soldlyne is also an OAuth server for assistants: Claude,
 * ChatGPT or any MCP client registers itself, a member signs in and consents, and the assistant gets
 * a token for /api/mcp.
 */
export function createAuth(settings: SignInSettings) {
  const company = companyLogin(settings)
  const mail = (to: string, content: { subject: string; text: string }) => sendOwnMail(settings, { to, ...content })
  return betterAuth({
    // Trusted: Better Auth's own tables lie outside any workspace.
    database: prismaAdapter(trustedPrisma, { provider: 'postgresql' }),
    emailAndPassword: {
      enabled: signInOf(settings).passwords,
      requireEmailVerification: true,
      minPasswordLength: 12,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => void (await mail(user.email, accountMail.reset(url))),
    },
    emailVerification: {
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => void (await mail(user.email, accountMail.confirm(url))),
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      cookieCache: { enabled: true, maxAge: 60 },
    },
    // The OAuth provider serves its own token endpoint; Better Auth's generic one stays off.
    disabledPaths: ['/token'],
    // Attempts counted in the database: a count in memory would be one per serverless instance.
    rateLimit: { storage: 'database' },
    account: {
      // Spelled out though it's the default: whoever signed up with this address and never proved it must not inherit the provider's account.
      accountLinking: { enabled: true, requireLocalEmailVerified: true },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user, context) => {
            // Only those not on the list need the database read.
            const invited = !isAdmin(user.email, settings) && (await hasLiveInvitation(user.email))
            if (context?.path === PASSWORD_SIGN_UP) {
              const refusal = passwordSignUpRefusal(user.email, settings, invited)
              // Not a 403: Better Auth answers one here with a pretend success, and they'd wait for a mail that never comes.
              if (refusal) throw new APIError('UNPROCESSABLE_ENTITY', { message: refusal, code: SIGN_UP_REFUSED })
              return
            }
            // False rather than an error: the provider's callback then sends the person back to /login?error=unable_to_create_user.
            if (!mayJoin(user, settings, invited)) return false
          },
        },
      },
    },
    plugins: [
      // Signs assistants' tokens. Nothing here reads its session header, and writing it reads the signing key on every request.
      jwt({ disableSettingJwtHeader: true }),
      genericOAuth({ config: company ? [company] : [] }),
      oauthProvider({
        loginPage: '/login',
        consentPage: '/consent',
        scopes: OAUTH_SCOPES,
        // Scopes spelled out, here and for clients: Prisma's lists can't hold the null the plugin would otherwise write for "any".
        resources: [{ identifier: mcpResource(), name: 'Soldlyne', allowedScopes: OAUTH_SCOPES }],
        clientRegistrationDefaultResources: [mcpResource()],
        clientRegistrationDefaultScopes: OAUTH_SCOPES,
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        clientRegistrationDefaultApplicationType: 'infer',
      }),
      nextCookies(),
    ],
  })
}

/** Whose token a request to /api/mcp carries: its signature, issuer, audience and expiry checked. Throws when any fails. */
export async function memberOfToken(request: Request): Promise<{ userId: string; clientId: string }> {
  const issuer = tokenIssuer()
  const payload = await verifyAccessTokenRequest(requestToResourceInput(request), { jwksUrl: `${issuer}/jwks`, verifyOptions: { issuer, audience: mcpResource() } })
  if (typeof payload.sub !== 'string') throw new Error("This token isn't a member's.")
  return { userId: payload.sub, clientId: typeof payload.azp === 'string' ? payload.azp : '' }
}

type Auth = ReturnType<typeof createAuth>

export type Session = Auth['$Infer']['Session']

const globalForAuth = globalThis as unknown as { soldlyneAuth?: Auth }

/** The install's auth, made on first use: starting up reads the database and reaches for the identity provider, which a build or a visitor with no session has no need of. */
export function auth(): Auth {
  globalForAuth.soldlyneAuth ??= createAuth(process.env)
  return globalForAuth.soldlyneAuth
}
