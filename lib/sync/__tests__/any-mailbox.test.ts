import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { connectStandIn, createBareWorkspace, removeWorkspace } from '@/test/fixtures'

const broken = vi.hoisted(() => ({ id: '' }))
vi.mock('@/lib/connectors/connections', async (original) => {
  const { boundWorkspaceId } = await import('@/lib/prisma')
  const real = await original<typeof import('@/lib/connectors/connections')>()
  return {
    ...real,
    isConnected: async (kind: string) => {
      if (boundWorkspaceId() === broken.id) throw new Error('A row this workspace can not read')
      return real.isConnected(kind)
    },
  }
})

const { prisma, runInWorkspace } = await import('@/lib/prisma')
const { anyMailboxConnected } = await import('../workspaces')

let working = ''

beforeAll(async () => {
  broken.id = (await createBareWorkspace('any-mailbox-broken')).id
  working = (await createBareWorkspace('any-mailbox-working')).id
})

afterAll(async () => {
  await removeWorkspace(broken.id)
  await removeWorkspace(working)
})

describe('whether the cron has anything to read', () => {
  it('still finds a mailbox behind a workspace that can not be asked', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await runInWorkspace(working, async () => {
      await prisma.mailbox.create({ data: { email: 'me@any-mailbox.example', displayName: 'Me', refreshToken: 'x' } })
      await connectStandIn('google', { clientId: 'id', clientSecret: 'secret' })
    })
    expect(await anyMailboxConnected()).toBe(true)
    await runInWorkspace(working, async () => {
      await prisma.mailbox.deleteMany({})
      await prisma.connection.deleteMany({})
    })
    warn.mockRestore()
  })

  it('looks anyway when the only answer it could not get might have been yes', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await anyMailboxConnected()).toBe(true)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
