'use client'

import { useState } from 'react'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'

/** Signs in with this install's identity provider, then on to `next`; an assistant's pending request continues by itself afterwards. */
export function LoginButton({ provider, name, next }: { provider: string; name: string; next: string }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <>
      <Button
        size="lg"
        className="mt-6 w-full"
        loading={pending}
        onClick={async () => {
          setPending(true)
          const { error: refused } = await authClient.signIn.social({ provider, callbackURL: next, errorCallbackURL: next === '/' ? '/login' : `/login?${new URLSearchParams({ next })}` })
          if (refused) {
            setError(refused.message ?? 'Sign-in failed. Try again.')
            setPending(false)
          }
        }}
      >
        Continue with {name}
      </Button>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </>
  )
}
