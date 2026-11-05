import { afterAll, describe, expect, it } from 'vitest'
import { createUser, removeUsers, removeWorkspace } from '@/test/fixtures'

const { prisma, runInWorkspace } = await import('@/lib/prisma')
const { trustedPrisma } = await import('@/lib/trusted-prisma')
const { activeWorkspace, createWorkspace, mayStartWorkspace, startWorkspace, workspaceNamed, workspacesOf } = await import('../workspaces')

const tag = `workspaces-${Date.now()}`
const created: string[] = []
const ADMINS = { SOLDLYNE_ADMINS: `founder@${tag}.example` }

afterAll(async () => {
  for (const id of created) await removeWorkspace(id)
  await removeUsers(`@${tag}.example`)
})

const one = { id: 'a', name: 'Alpha', role: 'OWNER' as const }
const two = { id: 'b', name: 'Beta', role: 'MEMBER' as const }

describe('a new workspace', () => {
  it('belongs to its creator, with its own default stages and product', async () => {
    const user = await createUser(`founder@${tag}.example`)
    const id = await createWorkspace(user.id, ' Acme ')
    created.push(id)
    expect(await workspacesOf(user.id)).toEqual([{ id, name: 'Acme', role: 'OWNER' }])
    const { stages, products } = await runInWorkspace(id, async () => ({ stages: await prisma.stage.findMany({ orderBy: { position: 'asc' } }), products: await prisma.product.findMany() }))
    expect(stages.map(({ name }) => name)).toEqual(['Identified', 'Contacted', 'Conversation', 'Meeting', 'Proposal', 'Won', 'Lost'])
    expect(new Set(stages.map(({ kind }) => kind))).toEqual(new Set(['OPEN', 'WON', 'LOST']))
    expect(products.map(({ name }) => name)).toEqual(['Main product'])
    expect((await trustedPrisma.workspace.findUniqueOrThrow({ where: { id } })).slug).toMatch(/^acme-/)
  })

  it('shares no default with another one', async () => {
    const user = await trustedPrisma.user.findUniqueOrThrow({ where: { email: `founder@${tag}.example` } })
    const id = await createWorkspace(user.id, 'Beta')
    created.push(id)
    const [first] = created
    const stagesOfFirst = await runInWorkspace(first, () => prisma.stage.findMany({ select: { id: true } }))
    const stagesOfSecond = await runInWorkspace(id, () => prisma.stage.findMany({ select: { id: true } }))
    expect(stagesOfSecond).toHaveLength(7)
    expect(stagesOfSecond.filter(({ id: stageId }) => stagesOfFirst.some((other) => other.id === stageId))).toEqual([])
  })
})

describe('who may start a workspace', () => {
  it("only those on the install's list, with a proved address", () => {
    expect(mayStartWorkspace({ email: `founder@${tag}.example`, emailVerified: true }, ADMINS)).toBe(true)
    expect(mayStartWorkspace({ email: `founder@${tag}.example`, emailVerified: false }, ADMINS)).toBe(false)
    expect(mayStartWorkspace({ email: `invited@${tag}.example`, emailVerified: true }, ADMINS)).toBe(false)
  })

  it('an invited member gets nothing created, and a blank name neither', async () => {
    const invited = await createUser(`invited@${tag}.example`)
    expect(await startWorkspace(invited, 'Mine', ADMINS)).toBeNull()
    expect(await workspacesOf(invited.id)).toEqual([])
    const founder = await trustedPrisma.user.findUniqueOrThrow({ where: { email: `founder@${tag}.example` } })
    expect(await startWorkspace(founder, '   ', ADMINS)).toBeNull()
  })

  it('someone on the list can add another, and it is cut to length', async () => {
    const founder = await trustedPrisma.user.findUniqueOrThrow({ where: { email: `founder@${tag}.example` } })
    const id = await startWorkspace(founder, 'x'.repeat(200), ADMINS)
    created.push(id!)
    expect((await trustedPrisma.workspace.findUniqueOrThrow({ where: { id: id! } })).name).toHaveLength(80)
  })
})

describe('the active workspace', () => {
  it('is the one the cookie names, if the member belongs there', () => {
    expect(activeWorkspace([one, two], 'b')).toBe(two)
  })

  it('falls back to the first when the cookie is missing, forged or stale', () => {
    expect(activeWorkspace([one, two], undefined)).toBe(one)
    expect(activeWorkspace([one, two], 'someone-elses')).toBe(one)
  })

  it('is nothing for someone with no workspace, whatever the cookie says', () => {
    expect(activeWorkspace([], 'a')).toBeUndefined()
  })
})

describe('the workspace an assistant names', () => {
  it('needs no name with one workspace', () => {
    expect(workspaceNamed([one], undefined)).toBe(one)
  })

  it('never lands anywhere by default with several', () => {
    expect(workspaceNamed([one, two], undefined)).toBeNull()
  })

  it('goes by id or exact name', () => {
    expect(workspaceNamed([one, two], 'b')).toBe(two)
    expect(workspaceNamed([one, two], 'Beta')).toBe(two)
    expect(workspaceNamed([one, two], 'beta')).toBeNull()
  })

  it("refuses a name the member isn't in, with one workspace or several", () => {
    expect(workspaceNamed([one], 'Other')).toBeNull()
    expect(workspaceNamed([one, two], 'Other')).toBeNull()
  })

  it('refuses a name two of theirs share rather than guessing', () => {
    expect(workspaceNamed([one, { ...two, name: 'Alpha' }], 'Alpha')).toBeNull()
  })
})
