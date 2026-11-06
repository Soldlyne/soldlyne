import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const asked = vi.hoisted(() => ({ client: null as { client_name?: string; client_uri?: string } | null, workspaces: [{ id: 'w', name: 'Northwind', role: 'MEMBER' }] }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/auth', () => ({ auth: () => ({ api: { getOAuthClientPublic: async () => asked.client } }) }))
vi.mock('@/lib/auth-client', () => ({ authClient: {} }))
vi.mock('@/lib/session', () => ({ requireUser: async () => ({ id: 'ada', email: 'ada@example.test' }) }))
vi.mock('@/lib/workspaces/workspaces', () => ({ workspacesOf: async () => asked.workspaces }))

const { default: ConsentPage } = await import('@/app/consent/page')

const screen = async (query: Record<string, string | string[] | undefined>) => renderToStaticMarkup(await ConsentPage({ searchParams: Promise.resolve(query) } as PageProps<'/consent'>))

const SPOOFED = { client_name: 'Claude', client_uri: 'https://claude.ai' }
const ELSEWHERE = { client_id: 'c', redirect_uri: 'https://collector.attacker.example/callback?x=1' }

beforeEach(() => {
  asked.client = SPOOFED
})

describe('the consent screen', () => {
  it("says where the access goes, and doesn't vouch for the address a client gave itself", async () => {
    const html = await screen(ELSEWHERE)
    expect(html).toContain('Claude wants to use Soldlyne')
    expect(html).toContain('collector.attacker.example')
    expect(html).not.toContain('claude.ai')
  })

  it("says the name is the client's own word", async () => {
    expect(await screen(ELSEWHERE)).toContain('chose that name itself')
  })

  it("reads an address as a browser does: what comes before an @ isn't the host", async () => {
    const html = await screen({ client_id: 'c', redirect_uri: 'https://claude.ai@collector.attacker.example/callback' })
    expect(html).toContain('collector.attacker.example')
    expect(html).not.toContain('claude.ai')
  })

  it("names what a local or an app's address is too", async () => {
    expect(await screen({ client_id: 'c', redirect_uri: 'http://localhost:53682/callback' })).toContain('localhost:53682')
    expect(await screen({ client_id: 'c', redirect_uri: 'cursor://anysphere.cursor-mcp/oauth' })).toContain('cursor://anysphere.cursor-mcp')
  })

  it("says so when it can't tell where the access goes", async () => {
    for (const query of [{ client_id: 'c' }, { client_id: 'c', redirect_uri: 'not an address' }, { client_id: 'c', redirect_uri: ['https://a.example/', 'https://b.example/'] }]) {
      const html = await screen(query)
      expect(html).toContain('can&#x27;t tell where')
      expect(html).not.toContain('a.example')
    }
  })

  it('mentions API keys among what it can do', async () => {
    expect(await screen(ELSEWHERE)).toContain('API keys')
  })
})
