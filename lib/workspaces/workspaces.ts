import 'server-only'
import type { MemberRole } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { mayJoin, type SignInSettings } from '@/lib/sign-in'
import { asWorkspace, trustedPrisma } from '@/lib/trusted-prisma'
import { createDefaults } from './defaults'

// Trusted: which workspaces someone belongs to is what a request needs before it can be bound to one.

const WORKSPACE_NAME_LENGTH = 80

export type MemberWorkspace = { id: string; name: string; role: MemberRole }

/** The workspaces someone belongs to, the first they joined first. */
export async function workspacesOf(userId: string): Promise<MemberWorkspace[]> {
  const memberships = await trustedPrisma.member.findMany({ where: { userId }, orderBy: { createdAt: 'asc' }, select: { role: true, workspace: { select: { id: true, name: true } } } })
  return memberships.map(({ role, workspace }) => ({ ...workspace, role }))
}

const slugOf = (name: string) => `${name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workspace'}-${randomUUID().slice(0, 6)}`

/** A new workspace, its creator its owner, with its own stages and product and nothing from their other workspaces. All or nothing. */
export async function createWorkspace(userId: string, name: string): Promise<string> {
  return trustedPrisma.$transaction(async (tx) => {
    const { id } = await tx.workspace.create({ data: { name: name.trim(), slug: slugOf(name) } })
    await tx.member.create({ data: { workspaceId: id, userId, role: 'OWNER' } })
    // Last, since the transaction stays in the app role from here on.
    await asWorkspace(tx, id)
    await createDefaults(tx)
    return id
  })
}

type Person = { id: string; email: string; emailVerified?: boolean | null }

/** Whether someone may start a workspace, their first or another: those on the install's list may; an invited member only joins. */
export const mayStartWorkspace = (person: Pick<Person, 'email' | 'emailVerified'>, settings: SignInSettings) => mayJoin(person, settings)

/** A workspace started by someone who may, or null. */
export async function startWorkspace(person: Person, name: string, settings: SignInSettings): Promise<string | null> {
  const named = name.trim().slice(0, WORKSPACE_NAME_LENGTH)
  return named && mayStartWorkspace(person, settings) ? createWorkspace(person.id, named) : null
}

/** The workspace a browser is in: the one it asked for if its member belongs there, otherwise their first. */
export const activeWorkspace = (workspaces: MemberWorkspace[], wanted: string | undefined): MemberWorkspace | undefined => workspaces.find(({ id }) => id === wanted) ?? workspaces[0]

/**
 * The workspace an assistant's call names, by id or exact name, among those its member belongs to.
 * Null when it names none of them, or could be two: an assistant must never land somewhere by default.
 * Naming nothing only works with one workspace, where there is nothing to choose.
 */
export function workspaceNamed(workspaces: MemberWorkspace[], named: string | undefined): MemberWorkspace | null {
  if (named === undefined) return workspaces.length === 1 ? workspaces[0] : null
  const matches = workspaces.filter(({ id, name }) => id === named || name === named)
  return matches.length === 1 ? matches[0] : null
}
