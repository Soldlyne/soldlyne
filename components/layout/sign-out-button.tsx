'use client'

import { authClient } from '@/lib/auth-client'

/** Ends the session, then a full page load, to sign-in or wherever signing in again should lead: nothing of this account stays in the browser's memory. */
export const signOut = (to = '/login') => authClient.signOut().then(() => window.location.assign(to))

export function SignOutButton({ to }: { to?: string }) {
  return (
    <button type="button" className="hover:text-foreground" onClick={() => signOut(to)}>
      Sign out
    </button>
  )
}
