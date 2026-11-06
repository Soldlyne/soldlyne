import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { OAUTH_STATE_COOKIE, OAUTH_STATE_PATH } from '@/lib/google/client'
import { finishConnectingMailbox } from '@/lib/google/connect-mailbox'
import { oauthStateIsFor, workspaceOfOAuthState } from '@/lib/google/state'
import { runInWorkspace } from '@/lib/prisma'
import { publicUrl } from '@/lib/public-url'
import { getSession } from '@/lib/session'
import { enterWorkspace } from '@/lib/workspaces/seat'
import { workspacesOf } from '@/lib/workspaces/workspaces'

const back = (query: string) => NextResponse.redirect(new URL(`/mailboxes?${query}`, publicUrl()))

export async function GET(request: Request) {
  const url = new URL(request.url)
  const session = await getSession()
  if (!session) return NextResponse.redirect(new URL('/login', publicUrl()))
  const jar = await cookies()
  const expected = jar.get(OAUTH_STATE_COOKIE)?.value
  // With its path, or it stays: it was set for that path alone.
  jar.delete({ name: OAUTH_STATE_COOKIE, path: OAUTH_STATE_PATH })
  if (!expected || url.searchParams.get('state') !== expected || !oauthStateIsFor(expected, session.user.id)) return back('error=state')
  // Checked again now: they may have left the workspace since the round trip began.
  const workspaceId = workspaceOfOAuthState(expected)
  if (!(await workspacesOf(session.user.id)).some(({ id }) => id === workspaceId)) return back('error=workspace')
  const code = url.searchParams.get('code')
  if (!code) return back('error=denied')
  const connected = await runInWorkspace(workspaceId, () => finishConnectingMailbox(code, publicUrl()))
  if ('error' in connected) return back(`error=${connected.error}`)
  await enterWorkspace(workspaceId)
  return back(`connected=${encodeURIComponent(connected.email)}`)
}
