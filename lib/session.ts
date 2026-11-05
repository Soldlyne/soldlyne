import 'server-only'
import { cache } from 'react'
import { getSessionCookie } from 'better-auth/cookies'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from './auth'

export const getSession = cache(async () => {
  const requestHeaders = await headers()
  // No session to look up: a bot or an uptime check shouldn't start auth or wake the database.
  if (!getSessionCookie(requestHeaders)) return null
  return auth().api.getSession({ headers: requestHeaders })
})

/** The signed-in user, or a redirect to /login. */
export async function requireUser() {
  const session = await getSession()
  if (!session) redirect('/login')
  return session.user
}
