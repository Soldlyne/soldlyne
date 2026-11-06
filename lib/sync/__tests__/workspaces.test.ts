import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { revalidateTag } from 'next/cache'
import { connectStandIn, createBareWorkspace, removeWorkspace } from '@/test/fixtures'

const synced: string[] = []
vi.mock('../contacts', async () => {
  const { boundWorkspaceId } = await import('@/lib/prisma')
  return {
    runSync: vi.fn(async () => {
      const workspaceId = boundWorkspaceId() as string
      synced.push(workspaceId)
      if (workspaceId === failing) throw new Error('A broken mailbox')
      return { emailsLogged: 1, mailboxErrors: 0, meetings: 0, calendarErrors: 0 }
    }),
  }
})

const { prisma, runInWorkspace } = await import('@/lib/prisma')
const { anyMailboxConnected, syncEveryWorkspace } = await import('../workspaces')
const { mailboxesChanged } = await import('../mailboxes-changed')

let failing = ''
let first = ''
let second = ''

beforeAll(async () => {
  first = (await createBareWorkspace('cron-a')).id
  second = (await createBareWorkspace('cron-b')).id
  failing = first
})

afterAll(async () => {
  await removeWorkspace(first)
  await removeWorkspace(second)
})

describe('the cron across workspaces', () => {
  it('runs each workspace in itself, and one failing does not hold back the others', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const totals = await syncEveryWorkspace()
    expect(synced).toEqual(expect.arrayContaining([first, second]))
    expect(totals.workspaceErrors).toBeGreaterThanOrEqual(1)
    expect(totals.emailsLogged).toBeGreaterThanOrEqual(1)
    warn.mockRestore()
  })

  it('finds a mailbox in any workspace, whichever comes first, once it has a client to read it with', async () => {
    const created = await runInWorkspace(second, () => prisma.mailbox.create({ data: { email: 'me@cron.example', displayName: 'Me', refreshToken: 'x' } }))
    const connection = await runInWorkspace(second, () => connectStandIn('google', { clientId: 'id', clientSecret: 'secret' }))
    expect(await anyMailboxConnected()).toBe(true)
    await runInWorkspace(second, () => prisma.connection.delete({ where: { id: connection.id } }))
    await runInWorkspace(second, () => prisma.mailbox.delete({ where: { id: created.id } }))
  })

  it('has nothing to read when a mailbox has no client, or a client no mailbox, even in two different workspaces', async () => {
    const mailbox = await runInWorkspace(first, () => prisma.mailbox.create({ data: { email: 'me@cron.example', displayName: 'Me', refreshToken: 'x' } }))
    expect(await anyMailboxConnected()).toBe(false)
    const connection = await runInWorkspace(second, () => connectStandIn('google', { clientId: 'id', clientSecret: 'secret' }))
    expect(await anyMailboxConnected()).toBe(false)
    await runInWorkspace(second, () => prisma.connection.delete({ where: { id: connection.id } }))
    await runInWorkspace(first, () => prisma.mailbox.delete({ where: { id: mailbox.id } }))
  })

  it('has nothing to read while Google refuses the client', async () => {
    const mailbox = await runInWorkspace(first, () => prisma.mailbox.create({ data: { email: 'me@cron.example', displayName: 'Me', refreshToken: 'x' } }))
    const connection = await runInWorkspace(first, () => connectStandIn('google', { clientId: 'id', clientSecret: 'secret' }))
    await runInWorkspace(first, () => prisma.connection.update({ where: { id: connection.id }, data: { status: 'FAILING' } }))
    expect(await anyMailboxConnected()).toBe(false)
    await runInWorkspace(first, () => prisma.connection.delete({ where: { id: connection.id } }))
    await runInWorkspace(first, () => prisma.mailbox.delete({ where: { id: mailbox.id } }))
  })

  it('clears the answer so that it expires at once rather than being served stale', () => {
    mailboxesChanged()
    expect(revalidateTag).toHaveBeenCalledWith('any-mailbox', { expire: 0 })
  })
})
