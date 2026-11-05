import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma, runInWorkspace } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { encrypt } from '@/lib/google/crypto'
import { exchangeCode, OAUTH_STATE_COOKIE, profileFromIdToken } from '@/lib/google/client'
import { workspaceOfOAuthState } from '@/lib/google/state'
import { mailboxesChanged } from '@/lib/sync/workspaces'
import { enterWorkspace } from '@/lib/workspaces/seat'
import { workspacesOf } from '@/lib/workspaces/workspaces'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const back = (query: string) => NextResponse.redirect(new URL(`/mailboxes?${query}`, url.origin))
  const session = await getSession()
  if (!session) return NextResponse.redirect(new URL('/login', url.origin))
  const jar = await cookies()
  const expected = jar.get(OAUTH_STATE_COOKIE)?.value
  jar.delete(OAUTH_STATE_COOKIE)
  if (!expected || url.searchParams.get('state') !== expected) return back('error=state')
  // Checked again now: they may have left the workspace since the round trip began.
  const workspaceId = workspaceOfOAuthState(expected)
  if (!(await workspacesOf(session.user.id)).some(({ id }) => id === workspaceId)) return back('error=workspace')
  const code = url.searchParams.get('code')
  if (!code) return back(`error=${encodeURIComponent(url.searchParams.get('error') ?? 'denied')}`)

  const token = await exchangeCode(code, url.origin)
  if (!token.refresh_token || !token.id_token) return back('error=no_refresh_token')
  if (!token.scope.includes('gmail.readonly')) return back('error=scopes')
  const profile = await profileFromIdToken(token.id_token)
  const data = {
    refreshToken: encrypt(token.refresh_token),
    accessToken: encrypt(token.access_token),
    tokenExpiresAt: new Date(Date.now() + token.expires_in * 1000),
    scopes: token.scope.split(' '),
    authFailedAt: null,
    lastError: null,
    active: true,
  }
  await runInWorkspace(workspaceId, () =>
    prisma.mailbox.upsert({
      where: { workspaceId_email: { workspaceId, email: profile.email } },
      create: { workspaceId, email: profile.email, displayName: profile.name ?? profile.email.split('@')[0], ...data },
      update: data,
    }),
  )
  mailboxesChanged()
  await enterWorkspace(workspaceId)
  return back(`connected=${encodeURIComponent(profile.email)}`)
}
