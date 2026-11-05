import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { Button } from '@/components/ui/button'
import { MailboxCard } from './mailbox-card'

export const metadata: Metadata = { title: 'Mailboxes' }

export default async function MailboxesPage({ searchParams }: PageProps<'/mailboxes'>) {
  const params = await searchParams
  // Tokens never leave the server.
  const mailboxes = await prisma.mailbox.findMany({ orderBy: { email: 'asc' }, omit: { refreshToken: true, accessToken: true } })
  const configured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.TOKENS_ENCRYPTION_KEY)

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 p-4 lg:p-8">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-1">
          <h1 className="text-xl font-semibold">Mailboxes</h1>
          <p className="mt-1 text-sm text-muted-foreground">Google Workspace mailboxes. Connect your inbox so emails and meetings with contacts land on their timelines.</p>
        </div>
        {configured && (
          <Button asChild>
            <a href="/api/google/connect">Connect a Google mailbox</a>
          </Button>
        )}
      </div>
      {params.connected && <p className="rounded-lg border bg-surface px-4 py-3 text-sm">Connected {String(params.connected)}.</p>}
      {params.error && <p className="rounded-lg border border-destructive/40 px-4 py-3 text-sm text-destructive">Connection failed: {String(params.error)}.</p>}
      {!configured && (
        <div className="rounded-lg border p-4 text-sm">
          <p className="font-medium">Setup needed before connecting a mailbox</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>Google Cloud console: enable the Gmail API, create an OAuth client (Web), with the redirect URI {'<this site>'}/api/google/callback.</li>
            <li>OAuth consent screen: Internal (Workspace) so no Google review is needed.</li>
            <li>Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, TOKENS_ENCRYPTION_KEY and CRON_SECRET in the environment.</li>
          </ol>
        </div>
      )}
      {mailboxes.length === 0 && configured && <p className="text-sm text-muted-foreground">No mailbox connected yet.</p>}
      <div className="space-y-4">
        {mailboxes.map((mailbox) => (
          <MailboxCard key={mailbox.id} mailbox={mailbox} />
        ))}
      </div>
    </div>
  )
}
