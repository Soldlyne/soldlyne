import type { Metadata } from 'next'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { connectionOf, type ConnectionView } from '@/lib/connectors/connections'
import { GOOGLE_CONNECTOR } from '@/lib/google/client'
import { prisma } from '@/lib/prisma'
import { MailboxCard } from './mailbox-card'

export const metadata: Metadata = { title: 'Mailboxes' }

const WHY_IT_FAILED: Record<string, string> = {
  state: 'the answer from Google was for another attempt. Start again from here.',
  workspace: "you're no longer in the workspace this mailbox was for.",
  denied: "Google didn't give access.",
  no_connector: "this workspace's Google connector isn't working. See Connectors.",
  client_refused: "Google refused this workspace's client. See Connectors.",
  google_refused: "Google didn't take the answer. Start again, and check the redirect address under Connectors if it keeps happening.",
  no_refresh_token: "Google didn't hand over lasting access. Start again.",
  scopes: 'read access to Gmail is needed: leave its box ticked on Google\'s page.',
}

type Waiting = { title: string; text: string }

/** Why no mailbox can sync or connect, and who can change that: only the workspace's owners and admins hold its Google client. */
function whyWaiting(google: ConnectionView | null, hasMailboxes: boolean): Waiting {
  if (google) return { title: "Google refused this workspace's client", text: 'Mailboxes wait until an owner or an admin fixes it, and pick up where they left off.' }
  if (hasMailboxes) return { title: "Google isn't connected in this workspace", text: 'These mailboxes wait until an owner or an admin connects its Google client again.' }
  return { title: "Google isn't connected in this workspace yet", text: 'Each company uses its own Google OAuth client. Once an owner or an admin has connected it, each member connects their mailbox from here.' }
}

function NeedsConnector({ title, text }: Waiting) {
  return (
    <div className="rounded-lg border p-4 text-sm">
      <p className="font-medium">{title}</p>
      <p className="mt-2 text-muted-foreground">
        {text}{' '}
        <Link href="/connectors" className="text-link underline-offset-4 hover:underline">
          See Connectors
        </Link>
      </p>
    </div>
  )
}

export default async function MailboxesPage({ searchParams }: PageProps<'/mailboxes'>) {
  const params = await searchParams
  // Tokens never leave the server.
  const [mailboxes, google] = await Promise.all([prisma.mailbox.findMany({ orderBy: { email: 'asc' }, omit: { refreshToken: true, accessToken: true } }), connectionOf(GOOGLE_CONNECTOR)])
  const ready = google?.status === 'CONNECTED'

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 p-4 lg:p-8">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-1">
          <h1 className="text-xl font-semibold">Mailboxes</h1>
          <p className="mt-1 text-sm text-muted-foreground">Google Workspace mailboxes. Connect your inbox so emails and meetings with contacts land on their timelines.</p>
        </div>
        {ready && (
          <Button asChild>
            <a href="/api/google/connect">Connect a Google mailbox</a>
          </Button>
        )}
      </div>
      {params.connected && <p className="rounded-lg border bg-surface px-4 py-3 text-sm">Connected {String(params.connected)}.</p>}
      {params.error && <p className="rounded-lg border border-destructive/40 px-4 py-3 text-sm text-destructive">Connection failed: {WHY_IT_FAILED[String(params.error)] ?? "Google didn't take it. Start again."}</p>}
      {!ready && <NeedsConnector {...whyWaiting(google, mailboxes.length > 0)} />}
      {mailboxes.length === 0 && ready && <p className="text-sm text-muted-foreground">No mailbox connected yet.</p>}
      <div className="space-y-4">
        {mailboxes.map((mailbox) => (
          <MailboxCard key={mailbox.id} mailbox={mailbox} googleReady={ready} />
        ))}
      </div>
    </div>
  )
}
