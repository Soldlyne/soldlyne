import { afterEach, describe, expect, it, vi } from 'vitest'

const anyMailboxConnected = vi.fn(async () => true)
const syncEveryWorkspace = vi.fn(async () => ({ workspaces: 2, emailsLogged: 2 }))
vi.mock('@/lib/sync/workspaces', () => ({ anyMailboxConnected, syncEveryWorkspace }))

const { GET } = await import('@/app/api/cron/sync/route')

const call = (authorization?: string) => GET(new Request('http://localhost/api/cron/sync', { headers: authorization ? { authorization } : {} }))

afterEach(() => {
  vi.unstubAllEnvs()
  anyMailboxConnected.mockClear()
  syncEveryWorkspace.mockClear()
})

describe('/api/cron/sync', () => {
  it('refuses a missing or wrong secret', async () => {
    vi.stubEnv('CRON_SECRET', 'right')
    expect((await call()).status).toBe(401)
    expect((await call('Bearer wrong')).status).toBe(401)
    expect(anyMailboxConnected).not.toHaveBeenCalled()
    expect(syncEveryWorkspace).not.toHaveBeenCalled()
  })

  it('refuses everything when CRON_SECRET is not configured', async () => {
    vi.stubEnv('CRON_SECRET', '')
    expect((await call('Bearer ')).status).toBe(401)
    expect(syncEveryWorkspace).not.toHaveBeenCalled()
  })

  it('runs the sync with the right secret', async () => {
    vi.stubEnv('CRON_SECRET', 'right')
    const response = await call('Bearer right')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ workspaces: 2, emailsLogged: 2 })
  })

  it('stops at the cached answer when no mailbox exists anywhere', async () => {
    vi.stubEnv('CRON_SECRET', 'right')
    anyMailboxConnected.mockResolvedValueOnce(false)
    const response = await call('Bearer right')
    expect(await response.json()).toEqual({ idle: true })
    expect(syncEveryWorkspace).not.toHaveBeenCalled()
  })
})
