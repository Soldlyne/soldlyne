import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { authorizationUrl, googleClient, OAUTH_STATE_COOKIE, OAUTH_STATE_PATH } from '@/lib/google/client'
import { newOAuthState } from '@/lib/google/state'
import { runInWorkspace } from '@/lib/prisma'
import { publicUrl } from '@/lib/public-url'
import { currentSeat } from '@/lib/workspaces/seat'

/** Sends a member to Google with their workspace's own client. Always the install's public address: it's the one the Connectors page says to register. */
export async function GET(request: Request) {
  const origin = publicUrl()
  const seat = await currentSeat()
  if (!seat) return NextResponse.redirect(new URL('/login', origin))
  const client = await runInWorkspace(seat.workspace.id, googleClient).catch(() => null)
  if (!client) return NextResponse.redirect(new URL('/mailboxes?error=no_connector', origin))
  const state = newOAuthState(randomBytes(24).toString('base64url'), seat.workspace.id, seat.user.id)
  const response = NextResponse.redirect(authorizationUrl(client, origin, state, new URL(request.url).searchParams.get('email') ?? undefined))
  response.cookies.set(OAUTH_STATE_COOKIE, state, { httpOnly: true, secure: origin.startsWith('https:'), sameSite: 'lax', maxAge: 600, path: OAUTH_STATE_PATH })
  return response
}
