import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { connectStandIn, createBareWorkspace, removeWorkspace } from '@/test/fixtures'

// Whoever a screen's request comes from, read fresh on each action.
const screen = vi.hoisted(() => ({ seat: vi.fn<() => Promise<unknown>>() }))
vi.mock('@/lib/workspaces/seat', () => ({ currentSeat: screen.seat, requireSeat: screen.seat }))

const { prisma, runInWorkspace } = await import('@/lib/prisma')
const { checkFromScreen, connectFromForm, disconnectFromScreen } = await import('../actions')

let here = ''
let elsewhere = ''

const seatAs = (role: string) => screen.seat.mockImplementation(async () => ({ user: { id: 'u', name: 'Ada', email: `${role.toLowerCase()}@acme.example`, emailVerified: true }, workspace: { id: here, name: 'Here', role }, workspaces: [] }))
const form = (fields: Record<string, string>) => {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}
const CLIENT = { clientId: 'the-client', clientSecret: 'the-secret' }
const connectionsHere = () => runInWorkspace(here, () => prisma.connection.findMany())
const NOT_ALLOWED = { ok: false, error: 'Only owners and admins can change connectors.' }

function googleTakesTheClient() {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }))
  vi.stubGlobal('fetch', fetch)
  return fetch
}

beforeAll(async () => {
  here = (await createBareWorkspace('connector-actions')).id
  elsewhere = (await createBareWorkspace('connector-actions-elsewhere')).id
  await runInWorkspace(elsewhere, () => connectStandIn('google', { clientId: 'elsewhere-client', clientSecret: 'elsewhere-secret' }))
})

afterAll(async () => {
  await removeWorkspace(here)
  await removeWorkspace(elsewhere)
})

beforeEach(() => runInWorkspace(here, () => prisma.connection.deleteMany()))
afterEach(() => vi.unstubAllGlobals())

describe.each(['OWNER', 'ADMIN'])('an %s', (role) => {
  it('connects, checks and disconnects, as themselves', async () => {
    seatAs(role)
    googleTakesTheClient()
    expect(await connectFromForm('google', null, form(CLIENT))).toMatchObject({ ok: true })
    expect((await connectionsHere())[0]).toMatchObject({ kind: 'google', connectedBy: `${role.toLowerCase()}@acme.example` })
    expect(await checkFromScreen('google')).toMatchObject({ ok: true })
    expect(await disconnectFromScreen('google')).toEqual({ ok: true })
    expect(await connectionsHere()).toEqual([])
  })
})

describe('a plain member', () => {
  it("can't connect, and no service is asked", async () => {
    seatAs('MEMBER')
    const fetch = googleTakesTheClient()
    expect(await connectFromForm('google', null, form(CLIENT))).toEqual(NOT_ALLOWED)
    expect(fetch).not.toHaveBeenCalled()
    expect(await connectionsHere()).toEqual([])
  })

  it("can't check or disconnect what's there", async () => {
    await runInWorkspace(here, () => connectStandIn('google', CLIENT))
    seatAs('MEMBER')
    const fetch = googleTakesTheClient()
    expect(await checkFromScreen('google')).toEqual(NOT_ALLOWED)
    expect(await disconnectFromScreen('google')).toEqual(NOT_ALLOWED)
    expect(fetch).not.toHaveBeenCalled()
    expect(await connectionsHere()).toHaveLength(1)
  })
})

describe('whoever it is', () => {
  it('an unknown connector is refused', async () => {
    seatAs('OWNER')
    expect(await connectFromForm('nothing', null, form({}))).toEqual({ ok: false, error: "This connector doesn't exist." })
    expect(await checkFromScreen('nothing')).toEqual({ ok: false, error: "This connector doesn't exist." })
  })

  it("an owner here doesn't touch another workspace's connector", async () => {
    seatAs('OWNER')
    await disconnectFromScreen('google')
    expect(await runInWorkspace(elsewhere, () => prisma.connection.count({ where: { kind: 'google' } }))).toBe(1)
    expect(await checkFromScreen('google')).toMatchObject({ ok: false })
  })
})
