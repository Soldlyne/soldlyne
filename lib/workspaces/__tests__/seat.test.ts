import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createUser, removeUsers, removeWorkspace } from '@/test/fixtures'

// One request's headers and cookies, as Next hands them out: the same headers object throughout.
const request = vi.hoisted(() => ({ headers: new Headers(), jar: new Map<string, string>(), session: vi.fn<() => Promise<unknown>>(async () => null) }))
const { jar, session } = request
vi.mock('next/headers', () => ({
  headers: async () => request.headers,
  cookies: async () => ({
    get: (name: string) => (request.jar.has(name) ? { value: request.jar.get(name) } : undefined),
    set: (name: string, value: string) => void request.jar.set(name, value),
    delete: (name: string) => void request.jar.delete(name),
  }),
}))
vi.mock('@/lib/session', () => ({ getSession: request.session, requireUser: async () => ((await request.session()) as { user: unknown }).user }))

const { prisma, currentWorkspaceId } = await import('@/lib/prisma')
const { trustedPrisma } = await import('@/lib/trusted-prisma')
const { createWorkspace } = await import('../workspaces')
const { currentSeat, enterWorkspace, forgetWorkspace, requireSeat } = await import('../seat')
const { switchWorkspace } = await import('../actions')

const tag = `seat-${Date.now()}`
const COOKIE = 'soldlyne_workspace'
let userId = ''
let first = ''
let second = ''
let foreign = ''

const nextRequest = () => {
  request.headers = new Headers()
}
const signIn = () => session.mockImplementation(async () => ({ user: { id: userId, name: 'Camille', email: `camille@${tag}.example`, emailVerified: true } }))

beforeAll(async () => {
  const user = await createUser(`camille@${tag}.example`)
  const stranger = await createUser(`stranger@${tag}.example`)
  userId = user.id
  first = await createWorkspace(user.id, 'First')
  second = await createWorkspace(user.id, 'Second')
  foreign = await createWorkspace(stranger.id, 'Foreign')
})

afterAll(async () => {
  for (const id of [first, second, foreign]) await removeWorkspace(id)
  await removeUsers(`@${tag}.example`)
})

beforeEach(() => {
  nextRequest()
  jar.clear()
  session.mockReset()
  session.mockImplementation(async () => null)
})

describe('a request with no session', () => {
  it('has no seat, and the tenant client throws: the redirect to sign in, not a query', async () => {
    expect(await currentSeat()).toBeNull()
    const toSignIn = { digest: expect.stringContaining('/login') }
    await expect(requireSeat()).rejects.toMatchObject(toSignIn)
    await expect(prisma.company.count()).rejects.toMatchObject(toSignIn)
    await expect(prisma.$transaction((tx) => tx.company.count())).rejects.toMatchObject(toSignIn)
  })
})

describe('a signed-in member', () => {
  it('is in their first workspace with no cookie, and the tenant client follows', async () => {
    signIn()
    expect((await currentSeat())?.workspace.id).toBe(first)
    expect(await currentWorkspaceId()).toBe(first)
    const stage = await prisma.stage.findFirstOrThrow()
    expect(stage.workspaceId).toBe(first)
  })

  it('is in the workspace the cookie names, once they belong to it', async () => {
    signIn()
    jar.set(COOKIE, second)
    expect((await currentSeat())?.workspace).toEqual({ id: second, name: 'Second', role: 'OWNER' })
    expect((await prisma.stage.findFirstOrThrow()).workspaceId).toBe(second)
  })

  it("isn't let in by a forged cookie: it falls back to their first, and sees nothing of the other", async () => {
    signIn()
    jar.set(COOKIE, foreign)
    expect((await currentSeat())?.workspace.id).toBe(first)
    expect((await prisma.stage.findFirstOrThrow()).workspaceId).toBe(first)
    jar.set(COOKIE, 'not-even-an-id')
    nextRequest()
    expect((await currentSeat())?.workspace.id).toBe(first)
  })

  it('reads their memberships once per request, and again on the next', async () => {
    signIn()
    await Promise.all([currentSeat(), currentSeat(), prisma.stage.count(), prisma.product.count()])
    expect(session).toHaveBeenCalledTimes(1)
    nextRequest()
    await currentSeat()
    expect(session).toHaveBeenCalledTimes(2)
  })

  it('moves at once when the cookie changes within a request, as after a switch', async () => {
    signIn()
    expect((await currentSeat())?.workspace.id).toBe(first)
    await enterWorkspace(second)
    expect((await currentSeat())?.workspace.id).toBe(second)
    await forgetWorkspace()
    expect((await currentSeat())?.workspace.id).toBe(first)
  })

  it('loses a workspace at once when removed from it: a stale cookie falls back', async () => {
    signIn()
    const third = await createWorkspace(userId, 'Third')
    await trustedPrisma.member.create({ data: { workspaceId: foreign, userId } })
    jar.set(COOKIE, foreign)
    expect((await currentSeat())?.workspace.id).toBe(foreign)
    await trustedPrisma.member.delete({ where: { workspaceId_userId: { workspaceId: foreign, userId } } })
    nextRequest()
    expect((await currentSeat())?.workspace.id).toBe(first)
    await removeWorkspace(third)
  })

  it('with no workspace at all has no seat, and is sent to /welcome', async () => {
    const lonely = await createUser(`lonely@${tag}.example`)
    session.mockImplementation(async () => ({ user: lonely }))
    expect(await currentSeat()).toBeNull()
    const toWelcome = { digest: expect.stringContaining('/welcome') }
    await expect(requireSeat()).rejects.toMatchObject(toWelcome)
    await expect(prisma.company.count()).rejects.toMatchObject(toWelcome)
  })
})

describe('switching', () => {
  it('moves to a workspace of theirs and goes home', async () => {
    signIn()
    await expect(switchWorkspace(second)).rejects.toMatchObject({ digest: expect.stringContaining(';/;') })
    expect(jar.get(COOKIE)).toBe(second)
    expect(await currentWorkspaceId()).toBe(second)
  })

  it("leaves the browser where it was when asked for one that isn't theirs", async () => {
    signIn()
    jar.set(COOKIE, second)
    await expect(switchWorkspace(foreign)).rejects.toThrow('NEXT_REDIRECT')
    expect(jar.get(COOKIE)).toBe(second)
    expect(await currentWorkspaceId()).toBe(second)
  })
})
