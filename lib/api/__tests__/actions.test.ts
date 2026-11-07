import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createBareWorkspace, createUser, removeUsers, removeWorkspace } from '@/test/fixtures'

const seat = vi.hoisted(() => ({ workspace: { id: '', name: 'Keys', slug: 'keys', role: 'OWNER' as string }, user: { id: 'u', name: 'U', email: 'u@example.com', emailVerified: true }, workspaces: [] as object[] }))
vi.mock('@/lib/workspaces/seat', () => ({ requireSeat: async () => seat }))

const { prisma, runInWorkspace } = await import('@/lib/prisma')
const { createApiKeyOfWorkspace, createHandoverKeyOfWorkspace, revokeApiKeyOfWorkspace } = await import('../actions')

const keysHere = () => runInWorkspace(seat.workspace.id, () => prisma.apiKey.findMany())

beforeAll(async () => {
  seat.workspace.id = (await createBareWorkspace('api-actions')).id
  seat.user.id = (await createUser(`maker-${Date.now()}@api-actions.example`)).id
})

afterAll(async () => {
  await removeWorkspace(seat.workspace.id)
  await removeUsers('@api-actions.example')
})

describe('a key for a prospecting tool', () => {
  const productIn = (workspaceId: string, name: string) => runInWorkspace(workspaceId, () => prisma.product.create({ data: { name } }))

  it.each(['OWNER', 'ADMIN'])('is made by an %s, on a product of this workspace, and does nothing but hand over', async (role) => {
    seat.workspace.role = role
    const product = await productIn(seat.workspace.id, `Audit ${role}`)
    const { key } = await createHandoverKeyOfWorkspace('For the tool', product.id)
    expect((await keysHere()).find(({ prefix }) => key.startsWith(prefix))).toMatchObject({ scopes: ['handover'], productId: product.id, createdBy: seat.user.id })
  })

  it('is refused to a member', async () => {
    seat.workspace.role = 'OWNER'
    const product = await productIn(seat.workspace.id, 'Not for members')
    seat.workspace.role = 'MEMBER'
    await expect(createHandoverKeyOfWorkspace('Mine', product.id)).rejects.toThrow('Only owners and admins manage API keys.')
  })

  it("can't name another workspace's product, or an archived one", async () => {
    seat.workspace.role = 'OWNER'
    const elsewhere = await createBareWorkspace('api-actions-other')
    const theirs = await productIn(elsewhere.id, 'Theirs')
    await expect(createHandoverKeyOfWorkspace('Mine', theirs.id)).rejects.toThrow('Choose a product of this workspace.')
    await removeWorkspace(elsewhere.id)
    const archived = await runInWorkspace(seat.workspace.id, () => prisma.product.create({ data: { name: 'Old', archived: true } }))
    await expect(createHandoverKeyOfWorkspace('Mine', archived.id)).rejects.toThrow('Choose a product of this workspace.')
  })

  it('ends with whoever made it, like any key', async () => {
    seat.workspace.role = 'OWNER'
    const product = await productIn(seat.workspace.id, 'Ends')
    const { key } = await createHandoverKeyOfWorkspace('Ends with its maker', product.id)
    const row = (await keysHere()).find(({ prefix }) => key.startsWith(prefix))!
    await revokeApiKeyOfWorkspace(row.id)
    expect((await keysHere()).find(({ id }) => id === row.id)?.revokedAt).toBeInstanceOf(Date)
  })
})

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
