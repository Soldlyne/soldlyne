'use client'

import { useActionState } from 'react'
import type { MemberRole } from '@prisma/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useRun } from '@/hooks/ui/use-run'
import { cancelInvitationOfWorkspace, changeMemberRole, inviteFromForm, leaveWorkspace, removeFromWorkspace } from '@/lib/workspaces/actions'
import type { Invited } from '@/lib/workspaces/invitations'
import { INVITABLE_ROLES, ROLE_NAMES } from '@/lib/workspaces/roles'
import type { Tried } from '@/lib/workspaces/team'

const SELECT = 'h-8 rounded-md border bg-background px-2 text-sm'

/** A refusal from the server reaches the person as a toast, like any other failed action. */
async function orThrow(tried: Promise<Tried>) {
  const answer = await tried
  if (!answer.ok) throw new Error(answer.error)
}

export function RoleSelect({ userId, name, role, choices }: { userId: string; name: string; role: MemberRole; choices: MemberRole[] }) {
  const { pending, run } = useRun()
  return (
    <select className={SELECT} aria-label={`Role of ${name}`} value={role} disabled={pending} onChange={(event) => run(() => orThrow(changeMemberRole(userId, event.target.value)))}>
      {choices.map((choice) => (
        <option key={choice} value={choice}>
          {ROLE_NAMES[choice]}
        </option>
      ))}
    </select>
  )
}

export function RemoveMemberButton({ userId, name }: { userId: string; name: string }) {
  const { pending, run } = useRun()
  return (
    <Button variant="ghost" size="xs" loading={pending} onClick={() => confirm(`Remove ${name} from this workspace? API keys they made stop working.`) && run(() => orThrow(removeFromWorkspace(userId)))}>
      Remove
    </Button>
  )
}

export function CancelInvitationButton({ id }: { id: string }) {
  const { pending, run } = useRun()
  return (
    <Button variant="ghost" size="xs" loading={pending} onClick={() => run(() => orThrow(cancelInvitationOfWorkspace(id)))}>
      Cancel
    </Button>
  )
}

export function LeaveButton({ workspaceName }: { workspaceName: string }) {
  const { pending, run } = useRun()
  return (
    <Button variant="outline" size="sm" loading={pending} onClick={() => confirm(`Leave ${workspaceName}? You'd need a new invitation to come back, and API keys you made stop working.`) && run(() => leaveWorkspace())}>
      Leave this workspace
    </Button>
  )
}

/** Invites by address and says what came of it: a mail on its way, or the link to pass on when no mail could leave. */
export function InviteForm() {
  const [invited, submit, pending] = useActionState<Invited | null, FormData>(inviteFromForm, null)
  return (
    <form action={submit} className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Input name="email" type="email" required placeholder="name@company.com" aria-label="Address to invite" className="h-8 min-w-0 flex-1 basis-56" />
        <select name="role" defaultValue="MEMBER" aria-label="Role" className={SELECT}>
          {INVITABLE_ROLES.map((role) => (
            <option key={role} value={role}>
              {ROLE_NAMES[role]}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" loading={pending}>
          Invite
        </Button>
      </div>
      {invited && !invited.ok && (
        <p role="status" className="text-sm text-destructive">
          {invited.error}
        </p>
      )}
      {invited?.ok && !invited.link && (
        <p role="status" className="text-sm text-muted-foreground">
          Invitation sent to {invited.email}.
        </p>
      )}
      {invited?.ok && invited.link && (
        <div role="status" className="space-y-2">
          <p className="text-sm text-muted-foreground">No mail could leave: copy this link for {invited.email}. It will not be shown again.</p>
          <p className="break-all rounded-md bg-surface px-3 py-2 font-mono text-xs">{invited.link}</p>
        </div>
      )}
    </form>
  )
}
