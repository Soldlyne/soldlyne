import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Client } from 'pg'
import { connectMailStandIn, connectStandIn, createBareWorkspace, removeWorkspace } from '@/test/fixtures'

const { NoWorkspaceError, prisma, runInWorkspace } = await import('@/lib/prisma')
const { sealText } = await import('@/lib/secrets')
const { checkConnection, connectedFields, connectionViews, disconnectConnection, isConnected } = await import('@/lib/connectors/connections')
const { canMailCustomers, mailCustomer } = await import('@/lib/connectors/customer-mail')
const { google } = await import('@/lib/connectors/kinds/google')
const { accessToken, googleClient } = await import('@/lib/google/client')

let a = ''
let b = ''
let none = ''
let mailboxA = ''
let mailboxB = ''

const asA = <T>(work: () => Promise<T>) => runInWorkspace(a, work)
const asB = <T>(work: () => Promise<T>) => runInWorkspace(b, work)
const asNone = <T>(work: () => Promise<T>) => runInWorkspace(none, work)

const newMailbox = () => prisma.mailbox.create({ data: { email: 'me@acme.example', displayName: 'Me', refreshToken: sealText('refresh') } })

beforeAll(async () => {
  a = (await createBareWorkspace('connections-a')).id
  b = (await createBareWorkspace('connections-b')).id
  none = (await createBareWorkspace('connections-none')).id
  await asA(() => connectStandIn('google', { clientId: 'client-a', clientSecret: 'secret-a' }))
  await asB(() => connectStandIn('google', { clientId: 'client-b', clientSecret: 'secret-b' }))
  await asA(() => connectMailStandIn('mail-key-a', 'A <quotes@a.example>'))
  await asB(() => connectMailStandIn('mail-key-b', 'B <quotes@b.example>'))
  mailboxA = (await asA(newMailbox)).id
  mailboxB = (await asB(newMailbox)).id
})

afterAll(async () => {
  for (const id of [a, b, none]) await removeWorkspace(id)
})

afterEach(() => vi.unstubAllGlobals())

describe("one workspace and another's connector", () => {
  it('each reads its own, and one with none reads nothing', async () => {
    expect(await asA(() => connectedFields('google'))).toEqual({ clientId: 'client-a', clientSecret: 'secret-a' })
    expect(await asB(() => connectedFields('google'))).toEqual({ clientId: 'client-b', clientSecret: 'secret-b' })
    expect(await asNone(() => connectedFields('google'))).toBeNull()
    expect(await asNone(googleClient)).toBeNull()
    expect(await asNone(() => isConnected('resend'))).toBe(false)
    expect(await asNone(canMailCustomers)).toBe(false)
  })

  it('the list shows its own rows alone', async () => {
    const seen = await asA(connectionViews)
    expect(seen).toHaveLength(2)
    expect(new Set(seen.map(({ workspaceId }) => workspaceId))).toEqual(new Set([a]))
    expect(await asNone(connectionViews)).toEqual([])
  })

  it("a token is refreshed with its own workspace's client, during the same run", async () => {
    const usedClient: string[] = []
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      usedClient.push(new URLSearchParams(String(init.body)).get('client_secret') as string)
      return new Response(JSON.stringify({ access_token: 'token', expires_in: 1, scope: 'x' }))
    })
    await asA(() => accessToken(mailboxA))
    await asB(() => accessToken(mailboxB))
    expect(usedClient).toEqual(['secret-a', 'secret-b'])
  })

  it("can't refresh another workspace's mailbox, even by its id", async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(asA(() => accessToken(mailboxB))).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })

  it("a customer's mail goes with its own key, and a workspace with none sends none", async () => {
    const sent: { key: string; from: string }[] = []
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      sent.push({ key: (init.headers as Record<string, string>).authorization, from: JSON.parse(String(init.body)).from })
      return new Response('{}')
    })
    const mail = { to: 'ada@customer.example', subject: 'S', text: 'T' }
    expect(await asA(() => mailCustomer(mail))).toBe(true)
    expect(await asB(() => mailCustomer(mail))).toBe(true)
    expect(await asNone(() => mailCustomer(mail))).toBe(false)
    expect(sent).toEqual([
      { key: 'Bearer mail-key-a', from: 'A <quotes@a.example>' },
      { key: 'Bearer mail-key-b', from: 'B <quotes@b.example>' },
    ])
  })

  it("checking and disconnecting one leaves the other's as it was", async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: 'invalid_client' }), { status: 401 }))
    const before = await asB(() => prisma.connection.findFirstOrThrow({ where: { kind: 'google' } }))
    await asA(() => checkConnection(google))
    expect((await asA(() => prisma.connection.findFirstOrThrow({ where: { kind: 'google' } }))).status).toBe('FAILING')
    await asA(() => disconnectConnection('google'))
    expect(await asA(() => isConnected('google'))).toBe(false)
    expect(await asB(() => prisma.connection.findFirstOrThrow({ where: { kind: 'google' } }))).toEqual(before)
    await asA(() => connectStandIn('google', { clientId: 'client-a', clientSecret: 'secret-a' }))
  })

  it("the same connector goes in both, and twice in one is refused", async () => {
    await expect(asA(() => connectStandIn('resend', { apiKey: 'again' }))).rejects.toThrow()
  })
})

describe('with no workspace', () => {
  it('nothing can be read or used, rather than running unscoped', async () => {
    await expect(connectedFields('google')).rejects.toBeInstanceOf(NoWorkspaceError)
    await expect(connectionViews()).rejects.toBeInstanceOf(NoWorkspaceError)
    await expect(googleClient()).rejects.toBeInstanceOf(NoWorkspaceError)
    await expect(disconnectConnection('google')).rejects.toBeInstanceOf(NoWorkspaceError)
    expect(await mailCustomer({ to: 'ada@customer.example', subject: 'S', text: 'T' })).toBe(false)
  })
})

describe('plain SQL on a real connection, as the app role', () => {
  let client: Client

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.DATABASE_URL })
    await client.connect()
  })

  afterAll(() => client.end())

  it("in A, B's sealed credentials are out of reach whatever the query says, and can't be changed or taken", async () => {
    await client.query('BEGIN')
    try {
      await client.query('SET LOCAL ROLE soldlyne_app')
      await client.query(`SELECT set_config('app.workspace_id', $1, true)`, [a])
      expect((await client.query(`SELECT "sealedCredentials" FROM "Connection" WHERE "workspaceId" = $1`, [b])).rows).toEqual([])
      expect((await client.query(`SELECT count(*)::int AS n FROM "Connection"`)).rows[0].n).toBe(2)
      expect((await client.query(`UPDATE "Connection" SET "sealedCredentials" = 'stolen' WHERE "workspaceId" = $1`, [b])).rowCount).toBe(0)
      expect((await client.query(`DELETE FROM "Connection" WHERE "workspaceId" = $1`, [b])).rowCount).toBe(0)
    } finally {
      await client.query('ROLLBACK')
    }
  })

  it('with no workspace set, the table holds no row', async () => {
    await client.query('BEGIN')
    try {
      await client.query('SET LOCAL ROLE soldlyne_app')
      expect((await client.query(`SELECT count(*)::int AS n FROM "Connection"`)).rows[0].n).toBe(0)
    } finally {
      await client.query('ROLLBACK')
    }
  })
})

describe('the way around the tenant client', () => {
  const ROOT = new URL('../..', import.meta.url).pathname
  const sources = (directory: string): string[] =>
    readdirSync(join(ROOT, directory), { withFileTypes: true }).flatMap((entry) => {
      if (entry.name === '__tests__') return []
      const path = join(directory, entry.name)
      return entry.isDirectory() ? sources(path) : [path]
    })

  it('is used by nothing that holds or reads a connector: the cron gets there bound to each workspace', () => {
    for (const file of [...sources('lib/connectors'), ...sources('lib/google'), ...sources('app/api/google'), 'lib/mcp/connector-tools.ts']) {
      expect(readFileSync(join(ROOT, file), 'utf8'), file).not.toContain('trusted-prisma')
    }
  })
})
