import { describe, expect, it, vi } from 'vitest'

const touched = (what: string) => () => {
  throw new Error(`An anonymous request ${what}`)
}

vi.mock('@/lib/trusted-prisma', () => ({ trustedPrisma: new Proxy({}, { get: touched('touched the database') }), databaseClient: touched('touched the database'), asWorkspace: touched('touched the database') }))
vi.mock('@/lib/auth', () => ({ auth: touched('woke auth'), mcpResource: () => '', tokenIssuer: () => '' }))

const { GET: deals } = await import('@/app/api/v1/deals/route')
const { GET: workspace } = await import('@/app/api/v1/workspace/route')

const ask = (handler: (request: Request) => Promise<Response>, authorization?: string) => handler(new Request('http://localhost:3100/api/v1/list', { headers: authorization ? { authorization } : {} }))

describe('a request with no key the install signed', () => {
  it.each([
    ['no header at all', undefined],
    ['an empty bearer', 'Bearer '],
    ['a token of another kind', 'Bearer lead_abcdef'],
    ['a made-up key', 'Bearer sl_madeup.signature'],
    ['the right start and no signature', 'Bearer sl_abcdefghijklmnop'],
  ])('with %s gets a 401, touching neither the database nor auth', async (_case, authorization) => {
    for (const handler of [deals, workspace]) {
      const response = await ask(handler, authorization)
      expect(response.status).toBe(401)
      expect(response.headers.get('www-authenticate')).toBe('Bearer')
      expect((await response.json()).error).toContain('API key')
    }
  })
})
