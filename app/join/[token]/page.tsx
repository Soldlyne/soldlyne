import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BrandPage } from '@/components/layout/brand-page'
import { SignOutButton } from '@/components/layout/sign-out-button'
import { Button } from '@/components/ui/button'
import { getSession } from '@/lib/session'
import { joinWorkspace } from '@/lib/workspaces/actions'
import { INVITATION_REFUSALS, invitationPath, seeInvitation, type InvitationRefusal } from '@/lib/workspaces/invitations'

// The link is the invitation: it mustn't follow someone to the next site they visit.
export const metadata: Metadata = { title: 'Join a workspace', referrer: 'no-referrer' }

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <BrandPage>
      <h1 className="text-xl font-semibold">{title}</h1>
      {children}
    </BrandPage>
  )
}

/** Why this link doesn't let them in, naming nobody; with the wrong account, a way to change it and come back. */
function Refused({ refusal, back }: { refusal: InvitationRefusal; back: string }) {
  return (
    <Card title="This invitation doesn't open a workspace for you">
      <p className="mt-2 text-sm text-muted-foreground">{INVITATION_REFUSALS[refusal]}</p>
      <div className="mt-5 text-sm text-muted-foreground">
        {refusal === 'other_address' ? (
          <SignOutButton to={`/login?${new URLSearchParams({ next: back })}`} />
        ) : (
          <Link href="/" className="text-link hover:underline">
            Back to the home page
          </Link>
        )}
      </div>
    </Card>
  )
}

/** Where an invitation's link leads. Asks first rather than joining on opening the link: mail scanners open links too, and nothing changes on a GET. */
export default async function JoinPage({ params }: PageProps<'/join/[token]'>) {
  const { token } = await params
  const back = invitationPath(token)
  const session = await getSession()
  // Nobody signed in: no database read, and nothing said about the invitation until they are.
  if (!session) redirect(`/login?${new URLSearchParams({ next: back })}`)
  const seen = await seeInvitation(session.user.id, token)
  if (seen.status !== 'open') return <Refused refusal={seen.status} back={back} />
  return (
    <Card title={`Join ${seen.workspaceName}`}>
      <p className="mt-2 text-sm text-muted-foreground">You will see its people, deals and pipeline, and your assistant can work in it with you.</p>
      <form action={joinWorkspace.bind(null, token)} className="mt-5">
        <Button type="submit" size="lg" className="w-full">
          Join the workspace
        </Button>
      </form>
    </Card>
  )
}
