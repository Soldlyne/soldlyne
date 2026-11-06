'use client'

import { useState, type FormEvent } from 'react'
import { authClient } from '@/lib/auth-client'
import { SIGN_UP_REFUSED } from '@/lib/sign-up-refused'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Mode = 'sign-in' | 'sign-up' | 'forgot'

const SUBMIT: Record<Mode, string> = { 'sign-in': 'Sign in', 'sign-up': 'Create my account', forgot: 'Send me a link' }

/** Better Auth's codes, in the member's words; a message written for them (who may join) comes through as it is. */
const ERRORS: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'Wrong address or password.',
  EMAIL_NOT_VERIFIED: 'Confirm your address first: a new link is on its way.',
  PASSWORD_TOO_SHORT: 'The password needs at least 12 characters.',
  INVALID_EMAIL: 'This address is not valid.',
}

function wordsFor(error: { code?: string; status?: number; message?: string }): string {
  if (error.status === 429) return 'Too many attempts: try again in a moment.'
  const known = error.code ? ERRORS[error.code] : undefined
  if (known) return known
  return error.code === SIGN_UP_REFUSED && error.message ? error.message : 'Sign-in failed. Try again.'
}

function Field({ id, label, ...props }: { id: string; label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} required {...props} />
    </div>
  )
}

function ModeLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="hover:text-foreground">
      {children}
    </button>
  )
}

/** Signs in, creates an account or asks for a new password, then on to `next`; an assistant's pending request continues by itself afterwards. */
export function PasswordForm({ next }: { next: string }) {
  const [mode, setMode] = useState<Mode>('sign-in')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)

  function show(next: Mode) {
    setMode(next)
    setError(null)
  }

  async function ask(email: string, password: string, name: string) {
    if (mode === 'sign-in') return (await authClient.signIn.email({ email, password, callbackURL: next })).error
    if (mode === 'sign-up') return (await authClient.signUp.email({ email, password, name, callbackURL: next })).error
    return (await authClient.requestPasswordReset({ email, redirectTo: '/reset-password' })).error
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const [email, password, name] = ['email', 'password', 'name'].map((field) => String(form.get(field) ?? ''))
    setPending(true)
    setError(null)
    const refused = await ask(email, password, name)
    setPending(false)
    if (refused) return setError(wordsFor(refused))
    if (mode === 'sign-up') setSent(`If ${email} may join, a confirmation link is on its way there: open it to activate your account. Joining takes an invitation.`)
    if (mode === 'forgot') setSent(`If ${email} has an account, a link to choose a new password is on its way.`)
  }

  if (sent) return <p className="mt-6 text-sm text-muted-foreground">{sent}</p>
  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      {mode === 'sign-up' && <Field id="name" label="Your name" maxLength={80} autoComplete="name" />}
      <Field id="email" label="Email address" type="email" autoComplete="email" />
      {mode !== 'forgot' && <Field id="password" label="Password" type="password" minLength={12} autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'} />}
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        {SUBMIT[mode]}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-center gap-4 text-sm text-muted-foreground">
        {mode === 'sign-in' ? (
          <>
            <ModeLink onClick={() => show('sign-up')}>Create an account</ModeLink>
            <ModeLink onClick={() => show('forgot')}>Forgot password</ModeLink>
          </>
        ) : (
          <ModeLink onClick={() => show('sign-in')}>I already have an account</ModeLink>
        )}
      </div>
    </form>
  )
}
