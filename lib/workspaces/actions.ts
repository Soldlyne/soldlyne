'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getSession, requireUser } from '@/lib/session'
import { safeNext } from '@/lib/safe-next'
import { acceptInvitation, cancelInvitation, invitationPath, inviteToWorkspace, type Invited } from './invitations'
import { ROLES } from './roles'
import { enterWorkspace, forgetWorkspace, requireSeat } from './seat'
import { changeRole, removeMember, type Tried } from './team'
import { startWorkspace, workspacesOf } from './workspaces'

// Only here, for someone at the screen: no assistant tool reaches any of this, so nothing written in a record can grant access.

const SETTINGS = '/settings'

/**
 * Moves this browser to another workspace of the member's; anything else leaves it where it was.
 * Home rather than the same address: a record's page belongs to the workspace just left.
 */
export async function switchWorkspace(workspaceId: string): Promise<void> {
  const user = await requireUser()
  if ((await workspacesOf(user.id)).some(({ id }) => id === workspaceId)) await enterWorkspace(workspaceId)
  redirect('/')
}

/** Starts a workspace for someone who may, enters it, and goes on. */
export async function createWorkspaceFromForm(form: FormData): Promise<void> {
  const user = await requireUser()
  const created = await startWorkspace(user, String(form.get('name') ?? ''), process.env)
  if (created) await enterWorkspace(created)
  redirect(safeNext(form.get('next')))
}

/** Joins the workspace and enters it. Refused, it goes back to the link's page, which says why. */
export async function joinWorkspace(token: string): Promise<void> {
  const session = await getSession()
  if (!session) redirect(`/login?${new URLSearchParams({ next: invitationPath(token) })}`)
  const joined = await acceptInvitation(session.user.id, token)
  if (!joined.ok) redirect(invitationPath(token))
  await enterWorkspace(joined.workspaceId)
  redirect('/')
}

export async function inviteFromForm(_previous: Invited | null, form: FormData): Promise<Invited> {
  const { user, workspace } = await requireSeat()
  const invited = await inviteToWorkspace(workspace, user.id, String(form.get('email') ?? ''), String(form.get('role') ?? ''))
  revalidatePath(SETTINGS)
  return invited
}

export async function cancelInvitationOfWorkspace(id: string): Promise<Tried> {
  const { user, workspace } = await requireSeat()
  const cancelled = await cancelInvitation(workspace.id, user.id, id)
  revalidatePath(SETTINGS)
  return cancelled
}

export async function changeMemberRole(targetId: string, role: string): Promise<Tried> {
  const { user, workspace } = await requireSeat()
  const known = ROLES.find((name) => name === role)
  if (!known) return { ok: false, error: "This role doesn't exist." }
  const changed = await changeRole(workspace.id, user.id, targetId, known)
  revalidatePath(SETTINGS)
  return changed
}

export async function removeFromWorkspace(targetId: string): Promise<Tried> {
  const { user, workspace } = await requireSeat()
  const removed = await removeMember(workspace.id, user.id, targetId)
  revalidatePath(SETTINGS)
  return removed
}

/** Leaves the workspace and goes home, in the member's next one, or to /welcome if it was their only one. */
export async function leaveWorkspace(): Promise<void> {
  const { user, workspace } = await requireSeat()
  const left = await removeMember(workspace.id, user.id, user.id)
  if (left.ok) await forgetWorkspace()
  redirect(left.ok ? '/' : SETTINGS)
}
