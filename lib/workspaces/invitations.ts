import 'server-only'
import { randomBytes } from 'node:crypto'
import type { MemberRole, Prisma } from '@prisma/client'
import { z } from 'zod'
import { sha256 } from '@/lib/hash'
import { canSendOwnMail, sendOwnMail } from '@/lib/mail'
import { prisma, runInWorkspace } from '@/lib/prisma'
import { publicUrl } from '@/lib/public-url'
import { trustedPrisma } from '@/lib/trusted-prisma'
import { normalizedEmail } from './invitation-gate'
import { INVITABLE_ROLES, managesTeam } from './roles'
import { teamOf, type Tried } from './team'

const DAYS_TO_ANSWER = 14
const DAY_MILLISECONDS = 86_400_000

const NOT_ALLOWED = 'Only owners and admins can invite to this workspace.'

export const invitationPath = (token: string) => `/join/${encodeURIComponent(token)}`

/** The invitation a member sends, in plain words; a stranger who receives it by mistake can ignore it. */
export function invitationMail({ inviter, workspaceName, url }: { inviter: string; workspaceName: string; url: string }) {
  return {
    subject: `${inviter} invited you to ${workspaceName} on Soldlyne`,
    text: `Hello,\n\n${inviter} invited you to join the workspace ${workspaceName} on Soldlyne. Open this link within ${DAYS_TO_ANSWER} days:\n${url}\n\nSign in or create your account with this address: the invitation only works for it.\n\nIf you weren't expecting this message, ignore it.`,
  }
}

/** A fresh invitation for this address, replacing any still open so an older link stops working. Only its hash is kept. */
async function saveInvitation(workspaceId: string, invitedById: string, email: string, role: MemberRole): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + DAYS_TO_ANSWER * DAY_MILLISECONDS)
  await runInWorkspace(workspaceId, () =>
    prisma.$transaction(async (tx) => {
      await tx.invitation.deleteMany({ where: { email, acceptedAt: null } })
      await tx.invitation.create({ data: { email, role, tokenHash: sha256(token), expiresAt, invitedById } })
    }),
  )
  return token
}

/** Whether the mail left: a failing mail provider mustn't lose the invitation, whose link the screen can still show. */
async function mailInvitation(to: string, content: Parameters<typeof invitationMail>[0]): Promise<boolean> {
  if (!canSendOwnMail(process.env)) return false
  return sendOwnMail(process.env, { to, ...invitationMail(content) }).catch(() => false)
}

export type Invited = { ok: true; email: string; link: string | null } | { ok: false; error: string }

/**
 * Invites someone to a workspace by their address. The link goes by mail; `link` carries it back only
 * when no mail left, for the inviter to pass on. It reaches their screen and nothing else: no tool
 * invites, since what's written in records can carry instructions and access stays a member's decision.
 */
export async function inviteToWorkspace(workspace: { id: string; name: string }, inviterId: string, address: string, role: string): Promise<Invited> {
  const email = normalizedEmail(address)
  if (!z.string().email().safeParse(email).success) return { ok: false, error: 'This address is not valid.' }
  const team = await teamOf(workspace.id)
  const inviter = team.find(({ userId }) => userId === inviterId)
  if (!managesTeam(inviter?.role)) return { ok: false, error: NOT_ALLOWED }
  if (!(INVITABLE_ROLES as readonly string[]).includes(role)) return { ok: false, error: 'Invite someone as an admin or a member.' }
  if (team.some((teammate) => normalizedEmail(teammate.email) === email)) return { ok: false, error: 'This person is already in this workspace.' }
  const token = await saveInvitation(workspace.id, inviterId, email, role as MemberRole)
  const url = `${publicUrl()}${invitationPath(token)}`
  const mailed = await mailInvitation(email, { inviter: inviter?.name ?? 'Someone', workspaceName: workspace.name, url })
  return { ok: true, email, link: mailed ? null : url }
}

/** A workspace's invitations no one has answered, expired ones included until someone sends them again or cancels them. */
export const openInvitationsOf = (workspaceId: string) =>
  runInWorkspace(workspaceId, () => prisma.invitation.findMany({ where: { acceptedAt: null }, orderBy: { createdAt: 'desc' }, select: { id: true, email: true, role: true, expiresAt: true } }))

export async function cancelInvitation(workspaceId: string, actorId: string, id: string): Promise<Tried> {
  const actor = (await teamOf(workspaceId)).find(({ userId }) => userId === actorId)
  if (!managesTeam(actor?.role)) return { ok: false, error: NOT_ALLOWED }
  const { count } = await runInWorkspace(workspaceId, () => prisma.invitation.deleteMany({ where: { id, acceptedAt: null } }))
  return count > 0 ? { ok: true } : { ok: false, error: 'This invitation is no longer open.' }
}

/** Why an invitation's link doesn't let someone in. It names nobody and no workspace: whoever holds the link may be anyone. */
export const INVITATION_REFUSALS = {
  unknown: "This link isn't valid, or the invitation was cancelled.",
  used: 'This invitation has already been used.',
  expired: 'This invitation has expired: ask the person who sent it for a new one.',
  other_address: 'This invitation was sent to another address than the one on your account. Sign in with the address that received it.',
} as const

export type InvitationRefusal = keyof typeof INVITATION_REFUSALS

type InvitationRow = { acceptedAt: Date | null; expiresAt: Date; email: string }

/**
 * Why this account can't use this invitation, or null. The account is read from the database rather
 * than the session, and its address must be proved: the link is good for one address and no other.
 */
async function refusalOf(client: Pick<Prisma.TransactionClient, 'user'>, row: InvitationRow | null, userId: string): Promise<InvitationRefusal | null> {
  if (!row) return 'unknown'
  if (row.acceptedAt) return 'used'
  if (row.expiresAt <= new Date()) return 'expired'
  const account = await client.user.findUnique({ where: { id: userId }, select: { email: true, emailVerified: true } })
  return account?.emailVerified && normalizedEmail(account.email) === row.email ? null : 'other_address'
}

export type InvitationSeen = { status: 'open'; workspaceName: string } | { status: InvitationRefusal }

/** What a signed-in person sees at an invitation's link. Trusted: the link comes before any workspace is known. */
export async function seeInvitation(userId: string, token: string): Promise<InvitationSeen> {
  const row = await trustedPrisma.invitation.findUnique({ where: { tokenHash: sha256(token) }, select: { acceptedAt: true, expiresAt: true, email: true, workspace: { select: { name: true } } } })
  const refused = await refusalOf(trustedPrisma, row, userId)
  return refused ? { status: refused } : { status: 'open', workspaceName: row!.workspace.name }
}

export type Joined = { ok: true; workspaceId: string } | { ok: false; refusal: InvitationRefusal }

/** Joins the workspace an invitation is for, once: claiming the row is what stops the same link being used twice at once. Trusted, like the membership it creates. */
export async function acceptInvitation(userId: string, token: string): Promise<Joined> {
  return trustedPrisma.$transaction(async (tx) => {
    const row = await tx.invitation.findUnique({ where: { tokenHash: sha256(token) } })
    const refused = await refusalOf(tx, row, userId)
    if (refused || !row) return { ok: false, refusal: refused ?? 'unknown' }
    const { count } = await tx.invitation.updateMany({ where: { id: row.id, acceptedAt: null }, data: { acceptedAt: new Date() } })
    if (count === 0) return { ok: false, refusal: 'used' }
    await tx.member.upsert({ where: { workspaceId_userId: { workspaceId: row.workspaceId, userId } }, create: { workspaceId: row.workspaceId, userId, role: row.role }, update: {} })
    return { ok: true, workspaceId: row.workspaceId }
  })
}
