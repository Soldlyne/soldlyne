'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'

/** The member's answer: Better Auth then sends the assistant back with a code, or with a refusal. */
export function ConsentButtons() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function answer(accept: boolean) {
    setBusy(true)
    const { data, error: failed } = await authClient.oauth2.consent({ accept })
    if (failed) {
      setError(failed.message ?? "The answer didn't go through.")
      setBusy(false)
      return
    }
    const target = (data as { url?: string; redirect_uri?: string } | null)?.url ?? (data as { redirect_uri?: string } | null)?.redirect_uri
    if (target) window.location.assign(target)
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button disabled={busy} onClick={() => answer(true)}>
        Authorize
      </Button>
      <Button variant="ghost" disabled={busy} onClick={() => answer(false)}>
        Refuse
      </Button>
      {error && <p className="w-full text-sm text-destructive">{error}</p>}
    </div>
  )
}
