'use client'

import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** Chooses a new password with the link's token: every open session ends with the old one. */
export function ResetForm({ token }: { token: string }) {
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError(null)
    const { error: refused } = await authClient.resetPassword({ newPassword: String(new FormData(event.currentTarget).get('password')), token })
    setPending(false)
    if (refused) return setError('This link has expired or was already used: ask for a new one.')
    setDone(true)
  }

  if (done) {
    return (
      <p className="mt-2 text-sm text-muted-foreground">
        Your password is changed.{' '}
        <Link href="/login" className="text-link hover:underline">
          Sign in
        </Link>
        .
      </p>
    )
  }
  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="password">New password</Label>
        <Input id="password" name="password" type="password" required minLength={12} autoComplete="new-password" />
      </div>
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Save the new password
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  )
}
