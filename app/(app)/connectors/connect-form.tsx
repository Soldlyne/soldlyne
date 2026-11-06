'use client'

import { useActionState, useId } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { connectFromForm } from '@/lib/connectors/actions'
import type { ConnectorAnswer } from '@/lib/connectors/connections'
import type { ConnectorField } from '@/lib/connectors/types'

function Field({ field }: { field: ConnectorField }) {
  const id = useId()
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id}>{field.label}</Label>
      {/* new-password: a browser shouldn't offer to save a company's key, or fill in a member's own password here. */}
      <Input id={id} name={field.key} type={field.secret ? 'password' : 'text'} autoComplete={field.secret ? 'new-password' : 'off'} required placeholder={field.placeholder} />
      {field.help && <p className="text-xs text-muted-foreground">{field.help}</p>}
    </div>
  )
}

/**
 * What the service's console gives, tried with the service before anything is saved. Nothing typed comes
 * back from the server, whatever happens. Success is a toast: connecting replaces this form with the
 * connected card, and what the check left unproved still has to reach the person.
 */
export function ConnectForm({ kind, fields, action }: { kind: string; fields: readonly ConnectorField[]; action: string }) {
  const [answer, submit, pending] = useActionState<ConnectorAnswer | null, FormData>(async (previous, form) => {
    const connected = await connectFromForm(kind, previous, form)
    if (connected.ok) toast.success(connected.note ?? 'Connected.')
    return connected
  }, null)
  return (
    <form action={submit} className="space-y-3 rounded-lg border p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((field) => (
          <Field key={field.key} field={field} />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" loading={pending}>
          {action}
        </Button>
        {answer && !answer.ok && (
          <p role="status" className="min-w-0 text-sm text-destructive">
            {answer.error}
          </p>
        )}
      </div>
    </form>
  )
}
