import 'server-only'
import type { MemberRole, Prisma } from '@prisma/client'
import { asWorkspace, trustedPrisma } from '@/lib/trusted-prisma'
import { refusalToChangeRole, refusalToRemove, type Teammate } from './roles'

// Trusted: memberships are read and written outside any workspace, and the app role has no grant on them.

export type Tried = { ok: true } | { ok: false; error: string }

/** A workspace's members, the first to join first. */
export async function teamOf(workspaceId: string) {
  const members = await trustedPrisma.member.findMany({ where: { workspaceId }, orderBy: { createdAt: 'asc' }, select: { userId: true, role: true, user: { select: { name: true, email: true } } } })
  return members.map(({ user, ...member }) => ({ ...member, ...user }))
}

/** The team, locked until the change is made: two owners demoting each other at once must not leave a workspace with none. */
const lockedTeam = (tx: Prisma.TransactionClient, workspaceId: string) => tx.$queryRaw<Teammate[]>`SELECT "userId", "role" FROM "Member" WHERE "workspaceId" = ${workspaceId} ORDER BY "createdAt" FOR UPDATE`

/**
 * The keys someone made stop with them: a key is shown once, so it may well have left with them. Keys
 * with no recorded maker stay. Last in its transaction: a key's row is the app role's to delete, and
 * the role it takes here lasts until the transaction ends.
 */
async function endKeysMadeBy(tx: Prisma.TransactionClient, workspaceId: string, userId: string) {
  await asWorkspace(tx, workspaceId)
  await tx.apiKey.deleteMany({ where: { createdBy: userId } })
}

/** Takes someone out of a workspace, themselves included when they leave. Their access ends at once: every path reads membership again, and the keys they made go in the same transaction. */
export async function removeMember(workspaceId: string, actorId: string, targetId: string): Promise<Tried> {
  return trustedPrisma.$transaction(async (tx) => {
    const refused = refusalToRemove(await lockedTeam(tx, workspaceId), actorId, targetId)
    if (refused) return { ok: false, error: refused }
    await tx.member.delete({ where: { workspaceId_userId: { workspaceId, userId: targetId } } })
    await endKeysMadeBy(tx, workspaceId, targetId)
    return { ok: true }
  })
}

export async function changeRole(workspaceId: string, actorId: string, targetId: string, role: MemberRole): Promise<Tried> {
  return trustedPrisma.$transaction(async (tx) => {
    const refused = refusalToChangeRole(await lockedTeam(tx, workspaceId), actorId, targetId, role)
    if (refused) return { ok: false, error: refused }
    await tx.member.update({ where: { workspaceId_userId: { workspaceId, userId: targetId } }, data: { role } })
    return { ok: true }
  })
}
