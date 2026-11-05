import type { MemberRole } from '@prisma/client'

/** Who may do what in a workspace's team. Being in a workspace is what opens its data; the role only says who runs its team. */

export const ROLES: readonly MemberRole[] = ['OWNER', 'ADMIN', 'MEMBER']

export const ROLE_NAMES: Record<MemberRole, string> = { OWNER: 'Owner', ADMIN: 'Admin', MEMBER: 'Member' }

/** What an invitation can make someone. Ownership is handed over by an owner, to someone already there. */
export const INVITABLE_ROLES: readonly MemberRole[] = ['ADMIN', 'MEMBER']

export type Teammate = { userId: string; role: MemberRole }

export const managesTeam = (role: MemberRole | undefined) => role === 'OWNER' || role === 'ADMIN'

const NOT_A_MANAGER = 'Only owners and admins manage the team.'
const OWNERS_ONLY = 'Only an owner can name, change or remove an owner.'
const LAST_OWNER = 'A workspace always keeps an owner: name another one first.'
const NOT_THERE = 'This person is no longer in this workspace.'

const roleOf = (team: Teammate[], userId: string) => team.find((teammate) => teammate.userId === userId)?.role
const isLastOwner = (team: Teammate[], userId: string) => roleOf(team, userId) === 'OWNER' && team.filter(({ role }) => role === 'OWNER').length === 1

/** Admins run the team but not its owners: otherwise an admin could name themselves owner and remove the one who invited them. */
function refusalToManage(team: Teammate[], actorId: string, targetId: string): string | null {
  const actor = roleOf(team, actorId)
  const target = roleOf(team, targetId)
  if (!managesTeam(actor)) return NOT_A_MANAGER
  if (!target) return NOT_THERE
  if (target === 'OWNER' && actor !== 'OWNER') return OWNERS_ONLY
  return isLastOwner(team, targetId) ? LAST_OWNER : null
}

/** Anyone may leave, except the workspace's last owner: it would belong to nobody. */
export const refusalToLeave = (team: Teammate[], userId: string): string | null => (isLastOwner(team, userId) ? LAST_OWNER : null)

export const refusalToRemove = (team: Teammate[], actorId: string, targetId: string): string | null =>
  actorId === targetId ? refusalToLeave(team, actorId) : refusalToManage(team, actorId, targetId)

export function refusalToChangeRole(team: Teammate[], actorId: string, targetId: string, role: MemberRole): string | null {
  const actor = roleOf(team, actorId)
  if (!managesTeam(actor)) return NOT_A_MANAGER
  if (role === roleOf(team, targetId)) return null
  if (role === 'OWNER' && actor !== 'OWNER') return OWNERS_ONLY
  return refusalToManage(team, actorId, targetId)
}
