import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { proxy } from '@/proxy'

const visit = (path: string, cookie?: string) => proxy(new NextRequest(`http://localhost:3100${path}`, { headers: cookie ? { cookie } : {} }))
const SIGNED_IN = 'better-auth.session_token=abc'

describe('the proxy', () => {
  it.each(['/login', '/reset-password', '/join/some-token', '/workspace/w1', '/q/some-token', '/q/some-token/pdf', '/api/auth/get-session', '/api/cron/sync', '/api/leads', '/.well-known/oauth-authorization-server/api/auth', '/mcp'])('lets %s through with no session: it answers for itself', (path) => {
    expect(visit(path).headers.get('x-middleware-next')).toBe('1')
  })

  it.each(['/', '/deals', '/settings', '/welcome', '/consent', '/quotes', '/quotes/q1', '/quotes/q1/pdf'])('sends %s to sign in with no session', (path) => {
    expect(visit(path).headers.get('location')).toBe('http://localhost:3100/login')
  })

  it('answers an API call with a 401 rather than a redirect', () => {
    expect(visit('/api/search').status).toBe(401)
  })

  it('lets a session through', () => {
    expect(visit('/deals', SIGNED_IN).headers.get('x-middleware-next')).toBe('1')
  })
})
