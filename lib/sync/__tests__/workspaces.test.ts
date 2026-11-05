import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { revalidateTag } from 'next/cache'
import { createBareWorkspace, removeWorkspace } from '@/test/fixtures'

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
const { anyMailboxConnected, mailboxesChanged, syncEveryWorkspace } = await import('../workspaces')

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

  it('finds a mailbox in any workspace, whichever comes first', async () => {
    const created = await runInWorkspace(second, () => prisma.mailbox.create({ data: { email: 'me@cron.example', displayName: 'Me', refreshToken: 'x' } }))
    expect(await anyMailboxConnected()).toBe(true)
    await runInWorkspace(second, () => prisma.mailbox.delete({ where: { id: created.id } }))
  })

  it('clears the answer so that it expires at once rather than being served stale', () => {
    mailboxesChanged()
    expect(revalidateTag).toHaveBeenCalledWith('any-mailbox', { expire: 0 })
  })
})
