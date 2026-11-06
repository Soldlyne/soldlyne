'use client'

import type { Mailbox } from '@prisma/client'
import { deleteMailbox, updateMailbox } from '@/lib/sync/actions'
import { EditableField } from '@/components/crm/editable-field'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useRun } from '@/hooks/ui/use-run'

export function MailboxCard({ mailbox, googleReady }: { mailbox: Omit<Mailbox, 'refreshToken' | 'accessToken'>; googleReady: boolean }) {
  const { run } = useRun()
  const save = (patch: Record<string, unknown>) => updateMailbox(mailbox.id, patch)

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-medium">{mailbox.email}</span>
        {!googleReady && <span className="text-xs text-muted-foreground">Waiting for the Google connector</span>}
        {mailbox.authFailedAt ? (
          <span className="text-xs text-destructive">Needs reconnect</span>
        ) : (
          !mailbox.active && <span className="text-xs text-muted-foreground">Paused</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Switch checked={mailbox.active} onCheckedChange={(checked) => run(() => updateMailbox(mailbox.id, { active: checked }))} />
            Active
          </label>
          {googleReady && (
            <Button variant="outline" size="xs" asChild>
              <a href={`/api/google/connect?email=${encodeURIComponent(mailbox.email)}`}>Reconnect</a>
            </Button>
          )}
          <Button variant="ghost" size="xs" onClick={() => confirm(`Remove ${mailbox.email}?`) && run(() => deleteMailbox(mailbox.id))}>
            Remove
          </Button>
        </div>
      </div>
      {mailbox.lastError && <p className="mt-1 text-xs text-destructive">{mailbox.lastError}</p>}
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <label className="flex items-center gap-1.5">
          <Switch checked={mailbox.syncContacts} onCheckedChange={(checked) => run(() => updateMailbox(mailbox.id, { syncContacts: checked }))} />
          Log emails and meetings with contacts
        </label>
        {mailbox.syncContacts && !mailbox.scopes.some((s) => s.includes('calendar')) && <span className="text-warning">Reconnect to add calendar access</span>}
        {mailbox.calendarSyncedAt && <span>Calendar synced {new Date(mailbox.calendarSyncedAt).toLocaleString('en-GB')}</span>}
      </div>
      <div className="mt-3 grid gap-x-8 md:grid-cols-2">
        <EditableField label="Name" field="displayName" value={mailbox.displayName} save={save} />
      </div>
    </div>
  )
}
