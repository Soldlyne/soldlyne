import { afterEach, beforeEach, describe, expect, vi } from 'vitest'
import { revalidateTag } from 'next/cache'
import { connectStandIn, workspaceForFile } from '@/test/fixtures'
import type { CheckAnswer, ConnectorDefinition } from '../types'

const { prisma } = await import('@/lib/prisma')
const { openFields } = await import('@/lib/secrets')
const { checkConnection, connectedFields, connectionOf, connectionViews, connectWith, disconnectConnection, isConnected, markFailing } = await import('../connections')
const { google } = await import('../kinds/google')

const workspace = workspaceForFile('connections')

let serviceSays: () => Promise<CheckAnswer> = async () => ({ ok: true })

/**
 * The shape of the next connector, an address and an API key: this file is all it takes for connecting,
 * trying, using and disconnecting to work, with no table, page or action of its own.
 */
const ADDRESS_AND_KEY: ConnectorDefinition = {
  kind: 'address-and-key',
  name: 'Sibling app',
  summary: 'Another app, reached at its address with a key.',
  fields: [
    { key: 'address', label: 'Address', secret: false },
    { key: 'apiKey', label: 'API key', secret: true },
  ],
  setup: () => [{ text: 'Make a key there.' }],
  check: vi.fn(async () => serviceSays()),
  whatStops: async () => 'Nothing comes across any more.',
}

const GOOD = { address: 'https://app.acme.example', apiKey: 'the-api-key' }
const connectGood = () => connectWith(ADDRESS_AND_KEY, GOOD, 'owner@acme.example')
const rowOf = () => prisma.connection.findFirstOrThrow({ where: { kind: ADDRESS_AND_KEY.kind } })

beforeEach(async () => {
  serviceSays = async () => ({ ok: true })
  vi.mocked(ADDRESS_AND_KEY.check).mockClear()
  vi.mocked(revalidateTag).mockClear()
  await workspace.run(() => prisma.connection.deleteMany())
})

afterEach(() => vi.unstubAllEnvs())

describe('connecting', () => {
  workspace.it('needs nothing but its definition: an address and a key go all the way through', async () => {
    expect(await connectGood()).toEqual({ ok: true, note: undefined })
    expect(await isConnected(ADDRESS_AND_KEY.kind)).toBe(true)
    expect(await connectedFields(ADDRESS_AND_KEY.kind)).toEqual(GOOD)
    expect((await checkConnection(ADDRESS_AND_KEY)).ok).toBe(true)
    await disconnectConnection(ADDRESS_AND_KEY.kind)
    expect(await isConnected(ADDRESS_AND_KEY.kind)).toBe(false)
  })

  workspace.it('seals the secret fields, and keeps the others readable', async () => {
    await connectGood()
    const row = await rowOf()
    expect(row.sealedCredentials).not.toContain('the-api-key')
    expect(openFields(row.sealedCredentials)).toEqual({ apiKey: 'the-api-key' })
    expect(row.settings).toEqual({ address: GOOD.address })
    expect(row.connectedBy).toBe('owner@acme.example')
    expect(row.checkedAt).toBeInstanceOf(Date)
  })

  workspace.it('seals both of Google\'s fields', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }))
    await connectWith(google, { clientId: 'the-id', clientSecret: 'the-secret' }, 'owner@acme.example')
    vi.unstubAllGlobals()
    const row = await prisma.connection.findFirstOrThrow({ where: { kind: 'google' } })
    expect(row.settings).toEqual({})
    expect(row.sealedCredentials).not.toContain('the-id')
    expect(openFields(row.sealedCredentials)).toEqual({ clientId: 'the-id', clientSecret: 'the-secret' })
  })

  workspace.it("tries it first: a refusal saves nothing, and doesn't repeat what was typed", async () => {
    serviceSays = async () => ({ ok: false, reason: 'Refused.' })
    const answer = await connectGood()
    expect(answer).toEqual({ ok: false, error: 'Refused.' })
    expect(JSON.stringify(answer)).not.toContain('the-api-key')
    expect(await connectionOf(ADDRESS_AND_KEY.kind)).toBeNull()
  })

  workspace.it('saves nothing when the service is down, and what it threw goes no further', async () => {
    serviceSays = async () => {
      throw new Error('fetch failed for the-api-key')
    }
    const answer = await connectGood()
    expect(answer).toEqual({ ok: false, error: "Sibling app didn't answer: try again in a moment." })
    expect(await connectionOf(ADDRESS_AND_KEY.kind)).toBeNull()
  })

  workspace.it('says what is missing, and tries nothing', async () => {
    expect(await connectWith(ADDRESS_AND_KEY, { address: '  ' }, 'owner@acme.example')).toEqual({ ok: false, error: 'Fill in: Address, API key.' })
    expect(ADDRESS_AND_KEY.check).not.toHaveBeenCalled()
  })

  workspace.it('takes only the fields it asks for, trimmed', async () => {
    await connectWith(ADDRESS_AND_KEY, { address: ' https://app.acme.example ', apiKey: ' the-api-key ', workspaceId: 'someone-else', $ACTION_ID: 'x' }, 'owner@acme.example')
    expect(await connectedFields(ADDRESS_AND_KEY.kind)).toEqual(GOOD)
  })

  workspace.it('connecting again replaces it on the same row, and clears a failure', async () => {
    await connectGood()
    const { id } = await rowOf()
    await markFailing(ADDRESS_AND_KEY.kind, 'Refused.')
    await connectWith(ADDRESS_AND_KEY, { ...GOOD, apiKey: 'a-new-key' }, 'admin@acme.example')
    const row = await rowOf()
    expect(row).toMatchObject({ id, status: 'CONNECTED', lastError: null, connectedBy: 'admin@acme.example' })
    expect(openFields(row.sealedCredentials).apiKey).toBe('a-new-key')
    expect(await prisma.connection.count({ where: { kind: ADDRESS_AND_KEY.kind } })).toBe(1)
  })

  workspace.it("refuses without the install's key, in words a member can use, and tries nothing", async () => {
    vi.stubEnv('SOLDLYNE_SECRETS_KEY', '')
    const answer = await connectGood()
    expect(answer.ok).toBe(false)
    expect(JSON.stringify(answer)).not.toContain('SOLDLYNE_SECRETS_KEY')
    expect(ADDRESS_AND_KEY.check).not.toHaveBeenCalled()
    expect(await connectionOf(ADDRESS_AND_KEY.kind)).toBeNull()
  })
})

describe('what can be read', () => {
  workspace.it('never holds the credentials, in a view or a list', async () => {
    await connectGood()
    const views = [await connectionOf(ADDRESS_AND_KEY.kind), ...(await connectionViews())]
    for (const view of views) expect(view).not.toHaveProperty('sealedCredentials')
    expect(JSON.stringify(views)).not.toContain('the-api-key')
  })

  workspace.it('logs nothing typed, whatever happens', async () => {
    const logged = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) => vi.spyOn(console, method))
    await connectGood()
    serviceSays = async () => {
      throw new Error('the-api-key')
    }
    await connectWith(ADDRESS_AND_KEY, GOOD, 'owner@acme.example')
    await checkConnection(ADDRESS_AND_KEY)
    expect(logged.flatMap((spy) => spy.mock.calls.flat()).map(String).join(' ')).not.toContain('the-api-key')
    for (const spy of logged) spy.mockRestore()
  })
})

describe('checking', () => {
  workspace.it('marks a refusal and says it, and nothing uses the connector until it passes again', async () => {
    await connectGood()
    serviceSays = async () => ({ ok: false, reason: 'Refused.' })
    expect(await checkConnection(ADDRESS_AND_KEY)).toEqual({ ok: false, error: 'Refused.' })
    expect(await rowOf()).toMatchObject({ status: 'FAILING', lastError: 'Refused.' })
    expect(await isConnected(ADDRESS_AND_KEY.kind)).toBe(false)
    expect(await connectedFields(ADDRESS_AND_KEY.kind)).toBeNull()
    serviceSays = async () => ({ ok: true, note: 'Good.' })
    expect(await checkConnection(ADDRESS_AND_KEY)).toEqual({ ok: true, note: 'Good.' })
    expect(await rowOf()).toMatchObject({ status: 'CONNECTED', lastError: null })
    expect(await connectedFields(ADDRESS_AND_KEY.kind)).toEqual(GOOD)
  })

  workspace.it('changes nothing when the service gives no answer: that says nothing about the credentials', async () => {
    await connectGood()
    const before = await rowOf()
    serviceSays = async () => ({ ok: false, reason: 'No answer.', unreachable: true })
    expect(await checkConnection(ADDRESS_AND_KEY)).toEqual({ ok: false, error: 'No answer.' })
    expect(await rowOf()).toMatchObject({ status: 'CONNECTED', lastError: null, checkedAt: before.checkedAt })
  })

  workspace.it("says when what's saved can't be opened, as after the install's key changed, and asks nobody", async () => {
    await connectStandIn(ADDRESS_AND_KEY.kind, { apiKey: 'x' }, { address: 'https://app.acme.example' })
    await prisma.connection.updateMany({ where: { kind: ADDRESS_AND_KEY.kind }, data: { sealedCredentials: 'v1.bad.bad.bad' } })
    const answer = await checkConnection(ADDRESS_AND_KEY)
    expect(answer.ok).toBe(false)
    expect(JSON.stringify(answer)).toContain('Connect it again')
    expect(ADDRESS_AND_KEY.check).not.toHaveBeenCalled()
    expect((await rowOf()).status).toBe('FAILING')
  })

  workspace.it('says when there is nothing to check', async () => {
    expect((await checkConnection(ADDRESS_AND_KEY)).ok).toBe(false)
    expect(ADDRESS_AND_KEY.check).not.toHaveBeenCalled()
  })
})

describe('the cron', () => {
  workspace.it('hears of every change, so its cached answer never goes stale', async () => {
    const heard = () => vi.mocked(revalidateTag).mock.calls.filter(([tag]) => tag === 'any-mailbox').length
    await connectGood()
    expect(heard()).toBe(1)
    await checkConnection(ADDRESS_AND_KEY)
    expect(heard()).toBe(2)
    await markFailing(ADDRESS_AND_KEY.kind, 'Refused.')
    expect(heard()).toBe(3)
    await disconnectConnection(ADDRESS_AND_KEY.kind)
    expect(heard()).toBe(4)
  })
})

describe("what disconnecting Google says", () => {
  workspace.it('names the mailboxes that depend on it, and what becomes of them', async () => {
    expect(await google.whatStops()).toBe('No mailbox depends on it yet.')
    await prisma.mailbox.create({ data: { email: 'ada@acme.example', displayName: 'Ada', refreshToken: 'x' } })
    const one = await google.whatStops()
    expect(one).toContain('1 mailbox stops syncing: ada@acme.example.')
    expect(one).toContain('stays on the timelines')
    expect(one).toContain('Connecting this same client again')
    expect(one).toContain('each mailbox has to connect again')
    await prisma.mailbox.create({ data: { email: 'bob@acme.example', displayName: 'Bob', refreshToken: 'x' } })
    expect(await google.whatStops()).toContain('2 mailboxes stop syncing: ada@acme.example, bob@acme.example.')
    await prisma.mailbox.deleteMany()
  })
})
