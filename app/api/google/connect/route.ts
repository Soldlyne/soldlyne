import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { authorizationUrl, OAUTH_STATE_COOKIE } from '@/lib/google/client'
import { newOAuthState } from '@/lib/google/state'
import { currentSeat } from '@/lib/workspaces/seat'

export async function GET(request: Request) {
  const seat = await currentSeat()
  if (!seat) return NextResponse.redirect(new URL('/login', request.url))
  const url = new URL(request.url)
  const state = newOAuthState(randomBytes(24).toString('base64url'), seat.workspace.id)
  const response = NextResponse.redirect(authorizationUrl(url.origin, state, url.searchParams.get('email') ?? undefined))
  response.cookies.set(OAUTH_STATE_COOKIE, state, { httpOnly: true, secure: url.protocol === 'https:', sameSite: 'lax', maxAge: 600, path: '/api/google' })
  return response
}
