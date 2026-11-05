import { Panel } from '@/components/crm/record-layout'
import { formatDate } from '@/lib/crm/format'
import { openInvitationsOf } from '@/lib/workspaces/invitations'
import { managesTeam, refusalToChangeRole, refusalToLeave, refusalToRemove, ROLE_NAMES, ROLES, type Teammate } from '@/lib/workspaces/roles'
import type { Seat } from '@/lib/workspaces/seat'
import { teamOf } from '@/lib/workspaces/team'
import { CancelInvitationButton, InviteForm, LeaveButton, RemoveMemberButton, RoleSelect } from './team-controls'

type Person = Awaited<ReturnType<typeof teamOf>>[number]

function PersonRow({ person, team, viewerId }: { person: Person; team: Teammate[]; viewerId: string }) {
  const choices = ROLES.filter((role) => refusalToChangeRole(team, viewerId, person.userId, role) === null)
  const mayRemove = person.userId !== viewerId && refusalToRemove(team, viewerId, person.userId) === null
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{person.name}</p>
        <p className="truncate text-xs text-muted-foreground">{person.email}</p>
      </div>
      <div className="flex items-center gap-2">
        {choices.length > 1 ? <RoleSelect userId={person.userId} name={person.name} role={person.role} choices={choices} /> : <span className="text-sm text-muted-foreground">{ROLE_NAMES[person.role]}</span>}
        {mayRemove && <RemoveMemberButton userId={person.userId} name={person.name} />}
      </div>
    </li>
  )
}

/** Invitations no one has answered; an expired one says so, and inviting the address again replaces it. */
async function OpenInvitations({ workspaceId }: { workspaceId: string }) {
  const invitations = await openInvitationsOf(workspaceId)
  if (invitations.length === 0) return null
  const now = new Date()
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium">Pending invitations</h3>
      <ul className="divide-y rounded-lg border">
        {invitations.map((invitation) => (
          <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm">{invitation.email}</p>
              <p className="text-xs text-muted-foreground">
                {ROLE_NAMES[invitation.role]} · {invitation.expiresAt > now ? `good until ${formatDate(invitation.expiresAt)}` : 'expired'}
              </p>
            </div>
            <CancelInvitationButton id={invitation.id} />
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Who works in this workspace, and for those who run its team, who else may. On the screen only: granting access stays with a person. */
export async function TeamSection({ seat }: { seat: Seat }) {
  const people = await teamOf(seat.workspace.id)
  const team = people.map(({ userId, role }) => ({ userId, role }))
  const lastOwner = refusalToLeave(team, seat.user.id)
  return (
    <Panel title="Team">
      <p className="mb-3 text-sm text-muted-foreground">Who works in {seat.workspace.name}. Only a person grants access, here: no assistant can invite or remove anyone.</p>
      <ul className="divide-y rounded-lg border">
        {people.map((person) => (
          <PersonRow key={person.userId} person={person} team={team} viewerId={seat.user.id} />
        ))}
      </ul>
      {managesTeam(seat.workspace.role) && (
        <div className="mt-5 space-y-5">
          <OpenInvitations workspaceId={seat.workspace.id} />
          <div>
            <h3 className="mb-2 text-sm font-medium">Invite someone</h3>
            <InviteForm />
          </div>
        </div>
      )}
      <div className="mt-5 border-t pt-4 text-sm text-muted-foreground">{lastOwner ? <p>{lastOwner}</p> : <LeaveButton workspaceName={seat.workspace.name} />}</div>
    </Panel>
  )
}
