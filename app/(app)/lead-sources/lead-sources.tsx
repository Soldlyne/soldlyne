'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Copy, KeyRound, Plus, Trash2 } from 'lucide-react'
import type { LeadSource } from '@prisma/client'
import { createLeadSource, deleteLeadSource, rotateLeadSourceKey, updateLeadSource } from '@/lib/leads/actions'
import { formatRelative } from '@/lib/crm/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useRun } from '@/hooks/ui/use-run'

type Option = { id: string; label: string }

function snippet(endpoint: string, key: string) {
  return `// On the site's server (route handler or server action), never in the browser:
await fetch("${endpoint}", {
  method: "POST",
  headers: { "content-type": "application/json", authorization: "Bearer ${key}" },
  body: JSON.stringify({
    email, firstName, lastName, company, jobTitle, message,
    consent: optInCheckbox === true, // explicit opt-in to emails
    page: "/waitlist",
  }),
})`
}

export function LeadSources({
  endpoint,
  sources,
  products,
}: {
  endpoint: string
  sources: Omit<LeadSource, 'keyHash'>[]
  products: Option[]
}) {
  const { pending, run } = useRun()
  const [name, setName] = useState('')
  const [revealed, setRevealed] = useState<{ name: string; key: string } | null>(null)
  const select = 'h-8 rounded-md border bg-background px-2 text-sm'

  return (
    <div className="space-y-6">
      {revealed && (
        <div className="space-y-2 rounded-lg border border-ring bg-surface p-4">
          <p className="text-sm font-medium">Key for {revealed.name}: copy it now, it will not be shown again.</p>
          <pre className="overflow-x-auto rounded-md bg-background p-3 text-xs">{snippet(endpoint, revealed.key)}</pre>
          <div className="flex gap-2">
            <Button
              size="xs"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(revealed.key)
                toast.success('Key copied')
              }}
            >
              <Copy /> Copy key
            </Button>
            <Button size="xs" variant="ghost" onClick={() => setRevealed(null)}>
              Done
            </Button>
          </div>
        </div>
      )}
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          run(async () => {
            const { key } = await createLeadSource({ name })
            setRevealed({ name, key })
            setName('')
          })
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New source, e.g. Waitlist" className="h-9 flex-1" />
        <Button type="submit" loading={pending} disabled={!name.trim()}>
          <Plus /> Add source
        </Button>
      </form>
      <div className="divide-y rounded-lg border">
        {sources.length === 0 && <p className="p-4 text-sm text-muted-foreground">No source yet.</p>}
        {sources.map((source) => (
          <div key={source.id} className="space-y-2 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{source.name}</span>
              <span className="font-mono text-xs text-muted-foreground">{source.keyPrefix}…</span>
              <span className="num text-xs text-muted-foreground">
                {source.leadCount} leads{source.lastLeadAt ? ` · last ${formatRelative(source.lastLeadAt)}` : ''}
              </span>
              <div className="ml-auto flex gap-1">
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() =>
                    confirm('Replace the key? The site must use the new one.') &&
                    run(async () => {
                      const { key } = await rotateLeadSourceKey(source.id)
                      setRevealed({ name: source.name, key })
                    })
                  }
                >
                  <KeyRound /> New key
                </Button>
                <Button variant="ghost" size="icon-xs" onClick={() => confirm(`Delete ${source.name}?`) && run(() => deleteLeadSource(source.id))} aria-label="Delete">
                  <Trash2 />
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Open a deal for</span>
                <select className={select} defaultValue={source.productId ?? ''} onChange={(e) => run(() => updateLeadSource(source.id, { productId: e.target.value || null }))}>
                  <option value="">No deal</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Switch checked={source.createTask} onCheckedChange={(checked) => run(() => updateLeadSource(source.id, { createTask: checked }))} />
                Follow-up task
              </label>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Endpoint: <span className="font-mono">{endpoint}</span>. Fields: email (required), firstName, lastName or name, company, jobTitle, phone, linkedinUrl, message,
        consent (true only if the person ticked an opt-in box), page, custom. Work-email domains create the company automatically.
      </p>
    </div>
  )
}
