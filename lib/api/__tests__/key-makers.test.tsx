import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createBareWorkspace, createUser, removeUsers, removeWorkspace } from '@/test/fixtures'
import { mcpClient } from '@/test/mcp-client'

const seat = vi.hoisted(() => ({ workspace: { id: '', name: 'Keys', slug: 'keys', role: 'OWNER' as string }, user: { id: '', name: 'U', email: 'u@example.com', emailVerified: true } }))
vi.mock('@/lib/workspaces/seat', () => ({ requireSeat: async () => seat }))

const { prisma, runInWorkspace } = await import('@/lib/prisma')
const { trustedPrisma } = await import('@/lib/trusted-prisma')
const { createApiKeyOfWorkspace } = await import('../actions')
const { createApiKey, listApiKeys } = await import('../keys')
const { findLiveApiKey } = await import('../key-lookup')
const { removeMember } = await import('@/lib/workspaces/team')
const { ApiKeyControls } = await import('@/app/(app)/settings/api-key-controls')

const tag = `key-makers-${Date.now()}`
const domain = `@${tag}.example`
const { tool, parsed } = mcpClient('http://localhost:3100')

let owner = ''
let here = ''

const teammate = async (workspaceId: string, name: string, role: 'ADMIN' | 'MEMBER' = 'ADMIN') => {
  const { id } = await createUser(`${name}${domain}`)
  await trustedPrisma.member.create({ data: { workspaceId, userId: id, role } })
  return id
}

/** A key made on the screen by this member, in the browser's workspace. */
async function madeOnScreen(workspaceId: string, userId: string, name = 'From the screen') {
  Object.assign(seat, { user: { ...seat.user, id: userId } })
  seat.workspace.id = workspaceId
  return (await createApiKeyOfWorkspace(name)).key
}

const opens = async (key: string) => Boolean(await findLiveApiKey(key))

beforeAll(async () => {
  process.env.BETTER_AUTH_URL = 'http://localhost:3100'
  process.env.BETTER_AUTH_SECRET ||= 'a'.repeat(32)
  owner = (await createUser(`owner${domain}`)).id
  here = (await createBareWorkspace(tag)).id
  await trustedPrisma.member.create({ data: { workspaceId: here, userId: owner, role: 'OWNER' } })
})

afterAll(async () => {
  await removeWorkspace(here)
  await removeUsers(domain)
})

describe('who made a key', () => {
  it('is kept when it is made on the screen', async () => {
    const admin = await teammate(here, 'screen')
    const key = await madeOnScreen(here, admin)
    const rows = await runInWorkspace(here, () => prisma.apiKey.findMany({ where: { createdBy: admin } }))
    expect(rows.map(({ prefix }) => key.startsWith(prefix))).toEqual([true])
  })

  it('is kept when an assistant makes it for its member', async () => {
    const admin = await teammate(here, 'assistant')
    const made = parsed(await tool(admin, 'create_api_key', { name: 'From an assistant' }))
    const rows = await runInWorkspace(here, () => prisma.apiKey.findMany({ where: { createdBy: admin } }))
    expect(rows.map(({ id }) => id)).toEqual([made.id])
  })
})

describe('the keys of someone leaving', () => {
  it('stop working when they are removed, made on the screen or by their assistant', async () => {
    const admin = await teammate(here, 'removed')
    const onScreen = await madeOnScreen(here, admin)
    const { key: byAssistant } = parsed(await tool(admin, 'create_api_key', { name: 'From an assistant' }))
    expect([await opens(onScreen), await opens(byAssistant)]).toEqual([true, true])
    expect(await removeMember(here, owner, admin)).toEqual({ ok: true })
    expect([await opens(onScreen), await opens(byAssistant)]).toEqual([false, false])
    expect(await runInWorkspace(here, () => prisma.apiKey.count({ where: { createdBy: admin } }))).toBe(0)
  })

  it('stop working when they leave by themselves', async () => {
    const admin = await teammate(here, 'leaving')
    const key = await madeOnScreen(here, admin)
    expect(await removeMember(here, admin, admin)).toEqual({ ok: true })
    expect(await opens(key)).toBe(false)
  })

  it("leave everyone else's alone, a key with no recorded maker, and their own in a workspace they stay in", async () => {
    const admin = await teammate(here, 'others')
    const owners = await madeOnScreen(here, owner)
    const { key: unknown } = await runInWorkspace(here, () => createApiKey('Made before makers were kept', null))
    const elsewhere = (await createBareWorkspace(`${tag}-b`)).id
    await trustedPrisma.member.create({ data: { workspaceId: elsewhere, userId: admin, role: 'ADMIN' } })
    await trustedPrisma.member.create({ data: { workspaceId: elsewhere, userId: owner, role: 'OWNER' } })
    const theirsElsewhere = await madeOnScreen(elsewhere, admin)
    expect(await removeMember(here, owner, admin)).toEqual({ ok: true })
    expect([await opens(owners), await opens(unknown), await opens(theirsElsewhere)]).toEqual([true, true, true])
    await removeWorkspace(elsewhere)
  })

  it('survive a removal that was refused', async () => {
    const admin = await teammate(here, 'refused')
    const key = await madeOnScreen(here, admin)
    const plain = await teammate(here, 'plain', 'MEMBER')
    expect((await removeMember(here, plain, admin)).ok).toBe(false)
    expect(await opens(key)).toBe(true)
  })

  it("go in the same transaction as the removal: if they can't, the person stays", async () => {
    const admin = await teammate(here, 'atomic')
    const key = await madeOnScreen(here, admin)
    await trustedPrisma.$executeRawUnsafe(`create function fail_for_a_test() returns trigger language plpgsql as $$ begin raise exception 'no'; end $$`)
    await trustedPrisma.$executeRawUnsafe(`create trigger fail_for_a_test before delete on "ApiKey" for each row execute function fail_for_a_test()`)
    await expect(removeMember(here, owner, admin)).rejects.toThrow()
    await trustedPrisma.$executeRawUnsafe(`drop trigger fail_for_a_test on "ApiKey"`)
    await trustedPrisma.$executeRawUnsafe(`drop function fail_for_a_test`)
    expect(await trustedPrisma.member.count({ where: { workspaceId: here, userId: admin } })).toBe(1)
    expect(await opens(key)).toBe(true)
  })
})

describe('the list of keys', () => {
  it('says which have no recorded maker, and what that means', async () => {
    const workspace = (await createBareWorkspace(`${tag}-list`)).id
    await runInWorkspace(workspace, () => createApiKey('Old one', null))
    await runInWorkspace(workspace, () => createApiKey('New one', owner))
    const html = renderToStaticMarkup(<ApiKeyControls keys={await runInWorkspace(workspace, listApiKeys)} />)
    expect(html.match(/maker unknown/g)).toHaveLength(1)
    expect(html.indexOf('maker unknown')).toBeGreaterThan(html.indexOf('Old one'))
    await removeWorkspace(workspace)
  })
})
