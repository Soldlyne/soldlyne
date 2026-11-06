import { beforeAll, describe, expect, vi } from 'vitest'
import type { Mailbox } from '@prisma/client'
import { workspaceForFile } from '@/test/fixtures'

class FakeGmailError extends Error {
  constructor(public status: number) {
    super(`Gmail ${status}`)
  }
}

// Gmail is faked: each test sets what the history and message reads return.
let history: () => { added: { id: string; threadId: string }[]; historyId: string }
let message: (id: string) => Record<string, unknown>
const read = vi.fn()
vi.mock('@/lib/google/client', () => ({
  GmailError: FakeGmailError,
  GoogleAuthError: class extends Error {},
  currentHistoryId: vi.fn(async () => 'now'),
  messagesSince: vi.fn(async (mailboxId: string) => {
    read(mailboxId)
    return history()
  }),
  messageMeta: vi.fn(async (_mailboxId: string, id: string) => message(id)),
}))

const { prisma } = await import('@/lib/prisma')
const { syncEmails } = await import('../contacts')

const tag = `gmail-${Date.now()}`
let mailbox: Mailbox

const email = (id: string) => ({
  id,
  threadId: `t-${id}`,
  snippet: 'Bonjour',
  internalDate: Date.now(),
  labelIds: ['INBOX'],
  headers: { from: `Camille <camille@${tag}.example>`, to: mailbox.email, subject: 'Projet' },
})
const cursor = async () => (await prisma.mailbox.findUniqueOrThrow({ where: { id: mailbox.id } })).historyId
const setCursor = (historyId: string | null) => prisma.mailbox.update({ where: { id: mailbox.id }, data: { historyId, lastError: null } })

const workspace = workspaceForFile(tag)

beforeAll(() =>
  workspace.run(async () => {
    mailbox = await prisma.mailbox.create({ data: { email: `me@out-${tag}.example`, displayName: 'Me', refreshToken: 'x' } })
    await prisma.person.create({ data: { firstName: 'Camille', emails: [`camille@${tag}.example`] } })
  }),
)

describe('syncEmails', () => {
  workspace.it('starts from now on the first run, without importing older mail', async () => {
    history = () => {
      throw new Error('must not read history without a cursor')
    }
    expect(await syncEmails()).toEqual({ emailsLogged: 0, mailboxErrors: 0 })
    expect(await cursor()).toBe('now')
  })

  workspace.it('logs mail with a known contact and moves the cursor', async () => {
    await setCursor('10')
    history = () => ({ added: [{ id: `a-${tag}`, threadId: 't' }], historyId: '11' })
    message = email
    expect(await syncEmails()).toEqual({ emailsLogged: 1, mailboxErrors: 0 })
    expect(await cursor()).toBe('11')
    expect(await prisma.activity.count({ where: { externalId: `a-${tag}`, source: 'GMAIL' } })).toBe(1)
  })

  workspace.it('skips a message that is gone and still moves the cursor', async () => {
    await setCursor('11')
    history = () => ({ added: [{ id: `gone-${tag}`, threadId: 't' }, { id: `b-${tag}`, threadId: 't' }], historyId: '12' })
    message = (id) => {
      if (id.startsWith('gone')) throw new FakeGmailError(404)
      return email(id)
    }
    expect(await syncEmails()).toEqual({ emailsLogged: 1, mailboxErrors: 0 })
    expect(await cursor()).toBe('12')
  })

  workspace.it('restarts from now when the cursor is too old', async () => {
    await setCursor('1')
    history = () => {
      throw new FakeGmailError(404)
    }
    expect(await syncEmails()).toEqual({ emailsLogged: 0, mailboxErrors: 0 })
    expect(await cursor()).toBe('now')
  })

  workspace.it('keeps the cursor and shows the error when a read fails', async () => {
    await setCursor('20')
    history = () => ({ added: [{ id: `c-${tag}`, threadId: 't' }], historyId: '21' })
    message = () => {
      throw new FakeGmailError(500)
    }
    expect(await syncEmails()).toEqual({ emailsLogged: 0, mailboxErrors: 1 })
    const after = await prisma.mailbox.findUniqueOrThrow({ where: { id: mailbox.id } })
    expect(after.historyId).toBe('20')
    expect(after.lastError).toBe('Gmail 500')
  })

  workspace.it('moves past a message that can not be logged, instead of stopping on it for ever', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await setCursor('30')
    history = () => ({ added: [{ id: `poison-${tag}`, threadId: 't' }, { id: `after-${tag}`, threadId: 't' }], historyId: '31' })
    message = (id) => (id.startsWith('poison') ? { ...email(id), internalDate: 'not a date' } : email(id))
    expect(await syncEmails()).toEqual({ emailsLogged: 1, mailboxErrors: 0 })
    expect(await cursor()).toBe('31')
    expect(await prisma.activity.count({ where: { externalId: `after-${tag}`, source: 'GMAIL' } })).toBe(1)
    expect((await prisma.mailbox.findUniqueOrThrow({ where: { id: mailbox.id } })).lastError).toBe("1 email couldn't be logged.")
    warn.mockRestore()
  })

  workspace.it("shows nothing of a database's words when something else fails", async () => {
    await setCursor('40')
    history = () => {
      throw new Error('Invalid `prisma.activity.create()` invocation: a value from a stranger')
    }
    expect(await syncEmails()).toEqual({ emailsLogged: 0, mailboxErrors: 1 })
    expect((await prisma.mailbox.findUniqueOrThrow({ where: { id: mailbox.id } })).lastError).toBe("This mailbox couldn't be read just now.")
  })

  workspace.it('does not read a mailbox with sync turned off', async () => {
    await prisma.mailbox.update({ where: { id: mailbox.id }, data: { syncContacts: false } })
    read.mockClear()
    await syncEmails()
    expect(read).not.toHaveBeenCalledWith(mailbox.id)
    await prisma.mailbox.update({ where: { id: mailbox.id }, data: { syncContacts: true } })
  })
})
