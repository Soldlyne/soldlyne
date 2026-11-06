import { afterEach, describe, expect, vi } from 'vitest'
import { connectStandIn, workspaceForFile } from '@/test/fixtures'

const { prisma } = await import('@/lib/prisma')
const { sealText } = await import('@/lib/secrets')
const { runSync } = await import('../contacts')

const workspace = workspaceForFile('run-sync')
const NOTHING = { emailsLogged: 0, mailboxErrors: 0, meetings: 0, calendarErrors: 0 }

afterEach(() => vi.unstubAllGlobals())

const addMailbox = () => prisma.mailbox.create({ data: { email: 'me@acme.example', displayName: 'Me', refreshToken: sealText('refresh'), scopes: ['https://www.googleapis.com/auth/calendar.events.readonly'] } })

describe('the cron run of one workspace', () => {
  workspace.it('waits with no connector: it asks Google nothing, and no mailbox is at fault', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const mailbox = await addMailbox()
    expect(await runSync()).toEqual(NOTHING)
    expect(fetch).not.toHaveBeenCalled()
    expect(await prisma.mailbox.findUniqueOrThrow({ where: { id: mailbox.id } })).toMatchObject({ authFailedAt: null, lastError: null })
    await prisma.mailbox.delete({ where: { id: mailbox.id } })
  })

  workspace.it('waits while Google refuses the client, and picks up when it passes again', async () => {
    const mailbox = await addMailbox()
    const connection = await connectStandIn('google', { clientId: 'the-client', clientSecret: 'the-secret' })
    await prisma.connection.update({ where: { id: connection.id }, data: { status: 'FAILING' } })
    const fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'invalid_client' }), { status: 401 }))
    vi.stubGlobal('fetch', fetch)
    expect(await runSync()).toEqual(NOTHING)
    expect(fetch).not.toHaveBeenCalled()
    await prisma.connection.update({ where: { id: connection.id }, data: { status: 'CONNECTED' } })
    expect((await runSync()).mailboxErrors).toBe(1)
    expect(fetch).toHaveBeenCalled()
    expect((await prisma.connection.findUniqueOrThrow({ where: { id: connection.id } })).status).toBe('FAILING')
    await prisma.mailbox.delete({ where: { id: mailbox.id } })
    await prisma.connection.delete({ where: { id: connection.id } })
  })
})
