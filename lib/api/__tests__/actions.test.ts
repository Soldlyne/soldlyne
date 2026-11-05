import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createBareWorkspace, removeWorkspace } from '@/test/fixtures'

const seat = vi.hoisted(() => ({ workspace: { id: '', name: 'Keys', slug: 'keys', role: 'OWNER' as string }, user: { id: 'u', name: 'U', email: 'u@example.com', emailVerified: true }, workspaces: [] as object[] }))
vi.mock('@/lib/workspaces/seat', () => ({ requireSeat: async () => seat }))

const { prisma, runInWorkspace } = await import('@/lib/prisma')
const { createApiKeyOfWorkspace, revokeApiKeyOfWorkspace } = await import('../actions')

const keysHere = () => runInWorkspace(seat.workspace.id, () => prisma.apiKey.findMany())

beforeAll(async () => {
  seat.workspace.id = (await createBareWorkspace('api-actions')).id
})

afterAll(() => removeWorkspace(seat.workspace.id))

describe('managing keys', () => {
  it.each(['OWNER', 'ADMIN'])('is open to an %s, who sees the key once and can end it', async (role) => {
    seat.workspace.role = role
    const { key } = await createApiKeyOfWorkspace(' For reporting ')
    const row = (await keysHere()).find(({ prefix }) => key.startsWith(prefix))!
    expect(row.name).toBe('For reporting')
    await revokeApiKeyOfWorkspace(row.id)
    expect((await keysHere()).find(({ id }) => id === row.id)?.revokedAt).toBeInstanceOf(Date)
  })

  it('is refused to a member, both ways', async () => {
    seat.workspace.role = 'OWNER'
    const { key } = await createApiKeyOfWorkspace('Stays')
    const before = await keysHere()
    const row = before.find(({ prefix }) => key.startsWith(prefix))!
    seat.workspace.role = 'MEMBER'
    await expect(createApiKeyOfWorkspace('Not mine')).rejects.toThrow('Only owners and admins manage API keys.')
    await expect(revokeApiKeyOfWorkspace(row.id)).rejects.toThrow('Only owners and admins manage API keys.')
    const after = await keysHere()
    expect(after).toHaveLength(before.length)
    expect(after.find(({ id }) => id === row.id)?.revokedAt).toBeNull()
  })
})
