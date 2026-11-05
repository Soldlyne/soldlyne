import { NextResponse, type NextRequest } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'

const PUBLIC_PAGES = ['/login', '/reset-password']

/** They say for themselves what someone with no session gets: an invitation's link and an assistant's link both come back after signing in, and a quote's link is for a customer with no account at all. */
const SELF_CHECKING = ['/join/', '/workspace/', '/q/']

// Optimistic check only: pages and actions verify the session themselves.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const publicApi = ['/api/auth/', '/api/cron/', '/api/leads', '/.well-known/']
  if (publicApi.some((prefix) => pathname.startsWith(prefix)) || pathname === '/mcp') {
    return NextResponse.next()
  }
  // These pages check the session themselves: a stale cookie must not bounce them back to /.
  if (PUBLIC_PAGES.includes(pathname) || SELF_CHECKING.some((prefix) => pathname.startsWith(prefix))) return NextResponse.next()
  const signedIn = Boolean(getSessionCookie(request))
  if (!signedIn) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.redirect(new URL('/login', request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'],
}
