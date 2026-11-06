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
  const googleAnswering = (read: (url: string) => Response) => vi.fn(async (url: string) => (String(url).includes('oauth2.googleapis.com') ? Response.json({ access_token: 'token', expires_in: 3600, scope: 'x' }) : read(String(url))))

  workspace.it("keeps Google's answer out of a mailbox's last error when a read fails", async () => {
    const mailbox = await addMailbox()
    await prisma.mailbox.update({ where: { id: mailbox.id }, data: { historyId: '10' } })
    const connection = await connectStandIn('google', { clientId: 'the-client', clientSecret: 'the-secret' })
    vi.stubGlobal('fetch', googleAnswering(() => new Response('{"error":{"message":"refused, key=abc123secret"}}', { status: 500 })))
    expect((await runSync()).mailboxErrors).toBe(1)
    const { lastError } = await prisma.mailbox.findUniqueOrThrow({ where: { id: mailbox.id } })
    expect(lastError).toContain('500')
    expect(lastError).not.toContain('abc123secret')
    await prisma.mailbox.delete({ where: { id: mailbox.id } })
    await prisma.connection.delete({ where: { id: connection.id } })
  })

  workspace.it('moves past a meeting that can not be logged, instead of stopping on it for ever', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mailbox = await prisma.mailbox.create({ data: { email: 'cal@acme.example', displayName: 'Me', refreshToken: sealText('refresh'), scopes: ['calendar'], historyId: '10' } })
    const person = await prisma.person.create({ data: { firstName: 'Camille', emails: ['camille@elsewhere.example'] } })
    const connection = await connectStandIn('google', { clientId: 'the-client', clientSecret: 'the-secret' })
    const attendees = [{ email: 'camille@elsewhere.example', responseStatus: 'accepted' }]
    const events = [{ id: 'poison', status: 'confirmed', start: { dateTime: 'not a date' }, attendees }, { id: 'after', status: 'confirmed', start: { dateTime: '2026-11-05T10:00:00Z' }, attendees }]
    vi.stubGlobal('fetch', googleAnswering((url) => (url.includes('calendar/v3') ? Response.json({ items: events, nextSyncToken: 'next' }) : Response.json({ historyId: '11' }))))
    expect(await runSync()).toMatchObject({ meetings: 1, calendarErrors: 1 })
    expect((await prisma.mailbox.findUniqueOrThrow({ where: { id: mailbox.id } })).calendarSyncToken).toBe('next')
    await prisma.activity.deleteMany({ where: { source: 'CALENDAR' } })
    await prisma.person.delete({ where: { id: person.id } })
    await prisma.mailbox.delete({ where: { id: mailbox.id } })
    await prisma.connection.delete({ where: { id: connection.id } })
    warn.mockRestore()
  })

  workspace.it("says a mailbox's tokens were refused in Soldlyne's own words", async () => {
    const mailbox = await addMailbox()
    await prisma.mailbox.update({ where: { id: mailbox.id }, data: { historyId: '10' } })
    const connection = await connectStandIn('google', { clientId: 'the-client', clientSecret: 'the-secret' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'refused, key=abc123secret' }), { status: 400 })))
    expect((await runSync()).mailboxErrors).toBe(1)
    const after = await prisma.mailbox.findUniqueOrThrow({ where: { id: mailbox.id } })
    expect(after.authFailedAt).not.toBeNull()
    expect(after.lastError).not.toContain('abc123secret')
    await prisma.mailbox.delete({ where: { id: mailbox.id } })
    await prisma.connection.delete({ where: { id: connection.id } })
  })

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
