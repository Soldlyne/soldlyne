import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { safeNext } from '@/lib/safe-next'
import { getSession } from '@/lib/session'
import { signInOf, type SignInMethods } from '@/lib/sign-in'
import { LoginButton } from './login-button'
import { PasswordForm } from './password-form'

export const metadata: Metadata = { title: 'Sign in' }

/** What Better Auth reports on the way back from a provider, in the member's words. */
const ERRORS: Record<string, string> = {
  access_denied: 'Sign-in was cancelled.',
  unable_to_create_user: 'This account has no access to Soldlyne.',
}

/** What the page says first, for the ways this install has, and to someone who came from an invitation. */
function introOf({ provider, passwords }: SignInMethods, next: string) {
  if (next.startsWith('/join/') && (provider || passwords)) return 'Sign in with the address that was invited, or create your account with it, to join the workspace.'
  if (provider) return `Sign in with your ${provider.name} account.`
  return passwords ? 'Sign in to your account.' : "Sign-in isn't set up on this install yet."
}

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { error: reported, next: asked } = await searchParams
  const next = safeNext(asked)
  if (await getSession()) redirect(next)
  const error = reported?.toString()
  const ways = signInOf(process.env)
  return (
    <main className="flex min-h-svh items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-semibold">Soldlyne</h1>
        <p className="mt-1 text-sm text-muted-foreground">{introOf(ways, next)}</p>
        {error && <p className="mt-4 text-sm text-destructive">{ERRORS[error] ?? 'Sign-in failed. Try again.'}</p>}
        {ways.provider && <LoginButton provider={ways.provider.id} name={ways.provider.name} next={next} />}
        {ways.passwords && <PasswordForm next={next} />}
      </div>
    </main>
  )
}
