import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createUser, removeUsers, removeWorkspace } from '@/test/fixtures'

const { prisma, runInWorkspace } = await import('@/lib/prisma')
const { trustedPrisma } = await import('@/lib/trusted-prisma')
const { createAuth } = await import('@/lib/auth')
const { createWorkspace, workspacesOf } = await import('../workspaces')
const { hasLiveInvitation } = await import('../invitation-gate')
const { acceptInvitation, cancelInvitation, invitationMail, invitationPath, inviteToWorkspace, openInvitationsOf, seeInvitation } = await import('../invitations')
const { teamOf, removeMember, changeRole } = await import('../team')

const tag = `invite-${Date.now()}`
const domain = `@${tag}.example`
const ORIGIN = 'http://localhost:3100'
const MAIL = { RESEND_API_KEY: 'key', SOLDLYNE_MAIL_FROM: 'Soldlyne <soldlyne@example.com>' }

let mails: { to: string[]; subject: string; text: string }[] = []
let owner = { id: '', name: '', email: '' }
let workspace = { id: '', name: 'Acme' }
let otherWorkspace = ''

/** A token out of a link, whether it came by mail or to the screen. */
const tokenIn = (text: string) => text.match(/\/join\/([\w-]+)/)![1]

async function invite(email: string, role = 'MEMBER') {
  const invited = await inviteToWorkspace(workspace, owner.id, email, role)
  if (!invited.ok) throw new Error(invited.error)
  return tokenIn(invited.link ?? mails.at(-1)!.text)
}

const useMail = () => {
  vi.stubEnv('RESEND_API_KEY', MAIL.RESEND_API_KEY)
  vi.stubEnv('SOLDLYNE_MAIL_FROM', MAIL.SOLDLYNE_MAIL_FROM)
}

beforeAll(async () => {
  owner = await createUser(`owner${domain}`, 'Olivia')
  workspace = { id: await createWorkspace(owner.id, 'Acme'), name: 'Acme' }
  otherWorkspace = await createWorkspace(owner.id, 'Other')
})

afterAll(async () => {
  await removeWorkspace(workspace.id)
  await removeWorkspace(otherWorkspace)
  await removeUsers(domain)
})

beforeEach(() => {
  mails = []
  vi.stubEnv('BETTER_AUTH_URL', ORIGIN)
  vi.stubEnv('BETTER_AUTH_SECRET', 'a'.repeat(32))
  vi.stubEnv('RESEND_API_KEY', '')
  vi.stubEnv('SOLDLYNE_MAIL_FROM', '')
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    mails.push(JSON.parse(String(init.body)))
    return new Response('{"id":"1"}')
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('inviting', () => {
  it('mails the link, keeps only its hash, and shows no link when the mail left', async () => {
    useMail()
    const invited = await inviteToWorkspace(workspace, owner.id, `Mailed${domain}`, 'ADMIN')
    expect(invited).toEqual({ ok: true, email: `mailed${domain}`, link: null })
    expect(mails[0].to).toEqual([`mailed${domain}`])
    const token = tokenIn(mails[0].text)
    const row = await trustedPrisma.invitation.findFirstOrThrow({ where: { email: `mailed${domain}` } })
    expect(row.tokenHash).not.toContain(token)
    expect(row.role).toBe('ADMIN')
    expect(row.invitedById).toBe(owner.id)
    const days = (row.expiresAt.getTime() - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(13.9)
    expect(days).toBeLessThanOrEqual(14)
  })

  it('shows the link to copy without mail settings, and when the mail provider fails', async () => {
    const withoutMail = await inviteToWorkspace(workspace, owner.id, `nomail${domain}`, 'MEMBER')
    expect(withoutMail).toMatchObject({ ok: true, link: expect.stringContaining(`${ORIGIN}/join/`) })
    expect(mails).toEqual([])
    useMail()
    vi.stubGlobal('fetch', async () => new Response('down', { status: 500 }))
    expect(await inviteToWorkspace(workspace, owner.id, `failing${domain}`, 'MEMBER')).toMatchObject({ ok: true, link: expect.stringContaining('/join/') })
  })

  it('replaces an open invitation: one per address, and the older link stops working', async () => {
    const older = await invite(`twice${domain}`)
    const newer = await invite(`twice${domain}`)
    expect((await openInvitationsOf(workspace.id)).filter(({ email }) => email === `twice${domain}`)).toHaveLength(1)
    const invited = await createUser(`twice${domain}`)
    expect(await seeInvitation(invited.id, older)).toEqual({ status: 'unknown' })
    expect(await seeInvitation(invited.id, newer)).toEqual({ status: 'open', workspaceName: 'Acme' })
  })

  it('refuses a bad address, a role no invitation can give, someone already there, and anyone but an owner or admin', async () => {
    expect(await inviteToWorkspace(workspace, owner.id, 'not an address', 'MEMBER')).toMatchObject({ ok: false })
    expect(await inviteToWorkspace(workspace, owner.id, `x${domain}`, 'OWNER')).toMatchObject({ ok: false })
    expect(await inviteToWorkspace(workspace, owner.id, owner.email.toUpperCase(), 'MEMBER')).toMatchObject({ ok: false, error: expect.stringContaining('already') })
    const member = await createUser(`plain${domain}`)
    await trustedPrisma.member.create({ data: { workspaceId: workspace.id, userId: member.id, role: 'MEMBER' } })
    expect(await inviteToWorkspace(workspace, member.id, `y${domain}`, 'MEMBER')).toMatchObject({ ok: false, error: expect.stringContaining('owners and admins') })
    const stranger = await createUser(`stranger${domain}`)
    expect(await inviteToWorkspace(workspace, stranger.id, `z${domain}`, 'MEMBER')).toMatchObject({ ok: false })
    expect(await cancelInvitation(workspace.id, member.id, 'whatever')).toMatchObject({ ok: false })
  })

  it('says what the mail is about, and tells a stranger to ignore it', () => {
    const { subject, text } = invitationMail({ inviter: 'Olivia', workspaceName: 'Acme', url: `${ORIGIN}/join/abc` })
    expect(subject).toContain('Acme')
    expect(text).toContain(`${ORIGIN}/join/abc`)
    expect(text).toContain('ignore it')
  })
})

describe('the link, signed in', () => {
  it('lets the invited address join with the invited role, once', async () => {
    const token = await invite(`joiner${domain}`, 'ADMIN')
    const joiner = await createUser(`joiner${domain}`)
    expect(await seeInvitation(joiner.id, token)).toEqual({ status: 'open', workspaceName: 'Acme' })
    expect(await acceptInvitation(joiner.id, token)).toEqual({ ok: true, workspaceId: workspace.id })
    expect(await workspacesOf(joiner.id)).toEqual([{ id: workspace.id, name: 'Acme', role: 'ADMIN' }])
    expect(await seeInvitation(joiner.id, token)).toEqual({ status: 'used' })
    expect(await acceptInvitation(joiner.id, token)).toEqual({ ok: false, refusal: 'used' })
  })

  it('refuses another address, revealing nothing of the workspace', async () => {
    const token = await invite(`intended${domain}`)
    const other = await createUser(`other${domain}`)
    const seen = await seeInvitation(other.id, token)
    expect(seen).toEqual({ status: 'other_address' })
    expect(JSON.stringify(seen)).not.toContain('Acme')
    expect(await acceptInvitation(other.id, token)).toEqual({ ok: false, refusal: 'other_address' })
    expect(await workspacesOf(other.id)).toEqual([])
  })

  it("refuses the right address when it isn't proved", async () => {
    const token = await invite(`unproved${domain}`)
    const unproved = await trustedPrisma.user.create({ data: { id: `u-${tag}`, email: `unproved${domain}`, name: 'U', emailVerified: false } })
    expect(await seeInvitation(unproved.id, token)).toEqual({ status: 'other_address' })
    expect(await acceptInvitation(unproved.id, token)).toEqual({ ok: false, refusal: 'other_address' })
  })

  it('says an expired invitation has expired', async () => {
    const token = await invite(`late${domain}`)
    await runInWorkspace(workspace.id, () => prisma.invitation.updateMany({ where: { email: `late${domain}` }, data: { expiresAt: new Date(Date.now() - 1000) } }))
    const late = await createUser(`late${domain}`)
    expect(await seeInvitation(late.id, token)).toEqual({ status: 'expired' })
    expect(await acceptInvitation(late.id, token)).toEqual({ ok: false, refusal: 'expired' })
  })

  it("doesn't know a made-up or cancelled link", async () => {
    const person = await createUser(`nobody${domain}`)
    expect(await seeInvitation(person.id, 'made-up')).toEqual({ status: 'unknown' })
    const token = await invite(`cancelled${domain}`)
    const [open] = (await openInvitationsOf(workspace.id)).filter(({ email }) => email === `cancelled${domain}`)
    expect(await cancelInvitation(workspace.id, owner.id, open.id)).toEqual({ ok: true })
    expect(await cancelInvitation(workspace.id, owner.id, open.id)).toMatchObject({ ok: false })
    expect(await seeInvitation(person.id, token)).toEqual({ status: 'unknown' })
  })

  it("can't cancel another workspace's invitation from this one", async () => {
    await invite(`keep${domain}`)
    const [open] = (await openInvitationsOf(workspace.id)).filter(({ email }) => email === `keep${domain}`)
    expect(await cancelInvitation(otherWorkspace, owner.id, open.id)).toMatchObject({ ok: false })
    expect((await openInvitationsOf(workspace.id)).some(({ id }) => id === open.id)).toBe(true)
  })

  it('builds a path that keeps the token whole', () => {
    expect(invitationPath('a/b')).toBe('/join/a%2Fb')
  })
})

describe('the team', () => {
  it('keeps its last owner whatever is asked, and ends a removed member at once', async () => {
    expect(await removeMember(workspace.id, owner.id, owner.id)).toMatchObject({ ok: false, error: expect.stringContaining('keeps an owner') })
    expect(await changeRole(workspace.id, owner.id, owner.id, 'MEMBER')).toMatchObject({ ok: false })
    const member = await createUser(`removed${domain}`)
    await trustedPrisma.member.create({ data: { workspaceId: workspace.id, userId: member.id } })
    expect(await removeMember(workspace.id, owner.id, member.id)).toEqual({ ok: true })
    expect((await workspacesOf(member.id)).some(({ id }) => id === workspace.id)).toBe(false)
    expect((await teamOf(workspace.id)).some(({ userId }) => userId === member.id)).toBe(false)
  })

  it('stops two owners demoting each other at once: one goes through', async () => {
    const pair = await createUser(`pair${domain}`)
    const place = await createWorkspace(owner.id, 'Pair')
    await trustedPrisma.member.create({ data: { workspaceId: place, userId: pair.id, role: 'OWNER' } })
    const results = await Promise.all([changeRole(place, owner.id, pair.id, 'MEMBER'), changeRole(place, pair.id, owner.id, 'MEMBER')])
    const owners = (await teamOf(place)).filter(({ role }) => role === 'OWNER')
    expect(owners).toHaveLength(1)
    expect(results.filter(({ ok }) => ok)).toHaveLength(1)
    await removeWorkspace(place)
  })
})

describe('the sign-up gate', () => {
  const SETTINGS = { SOLDLYNE_PASSWORD_SIGN_IN: 'true', SOLDLYNE_ADMINS: `founder${domain}`, ...MAIL }
  const signUp = (email: string, settings = SETTINGS) =>
    createAuth(settings).handler(new Request(`${ORIGIN}/api/auth/sign-up/email`, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: JSON.stringify({ email, password: 'correct horse battery', name: 'Camille' }) }))
  const fromProvider = (email: string, emailVerified: boolean) => createAuth(SETTINGS).options.databaseHooks!.user!.create!.before!({ email, emailVerified } as never, { path: '/callback/oidc' } as never)

  it('knows whose invitation is live: not an expired, used or cancelled one', async () => {
    await invite(`live${domain}`)
    expect(await hasLiveInvitation(`LIVE${domain}`)).toBe(true)
    expect(await hasLiveInvitation(`never${domain}`)).toBe(false)
    expect(await hasLiveInvitation(`late${domain}`)).toBe(false)
    expect(await hasLiveInvitation(`joiner${domain}`)).toBe(false)
    expect(await hasLiveInvitation(`cancelled${domain}`)).toBe(false)
  })

  it('lets an invited address get an account with a password, and still asks it to prove the address', async () => {
    await invite(`signup${domain}`)
    mails = []
    expect((await signUp(`signup${domain}`)).status).toBe(200)
    expect(mails.map(({ to }) => to)).toEqual([[`signup${domain}`]])
    expect((await trustedPrisma.user.findUniqueOrThrow({ where: { email: `signup${domain}` } })).emailVerified).toBe(false)
  })

  it('gives anyone else no account, and an answer that gives nothing away', async () => {
    const response = await signUp(`uninvited${domain}`)
    expect(response.status).toBe(200)
    expect(await trustedPrisma.user.count({ where: { email: `uninvited${domain}` } })).toBe(0)
  })

  it('gives no account to an address whose invitation expired', async () => {
    await invite(`late2${domain}`)
    await runInWorkspace(workspace.id, () => prisma.invitation.updateMany({ where: { email: `late2${domain}` }, data: { expiresAt: new Date(Date.now() - 1000) } }))
    expect((await signUp(`late2${domain}`)).status).toBe(200)
    expect(await trustedPrisma.user.count({ where: { email: `late2${domain}` } })).toBe(0)
  })

  it('through a provider: an invited, verified address gets in; anyone else gets the redirect that says so', async () => {
    await invite(`oidc${domain}`)
    await expect(fromProvider(`oidc${domain}`, true)).resolves.toBeUndefined()
    await expect(fromProvider(`oidc${domain}`, false)).resolves.toBe(false)
    await expect(fromProvider(`uninvited${domain}`, true)).resolves.toBe(false)
  })
})
