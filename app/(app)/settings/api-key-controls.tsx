'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Copy, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useRun } from '@/hooks/ui/use-run'
import { createApiKeyOfWorkspace, revokeApiKeyOfWorkspace } from '@/lib/api/actions'
import type { ListedApiKey } from '@/lib/api/keys'
import { formatRelative } from '@/lib/crm/format'

export function RevealedKey({ apiKey, onDone }: { apiKey: string; onDone: () => void }) {
  return (
    <div className="space-y-2 rounded-lg border border-ring bg-surface p-3">
      <p className="text-sm font-medium">Copy this key now: it won&apos;t be shown again.</p>
      <pre className="overflow-x-auto rounded-md bg-background p-3 text-xs">{apiKey}</pre>
      <div className="flex gap-2">
        <Button
          size="xs"
          variant="outline"
          onClick={async () => {
            await navigator.clipboard.writeText(apiKey)
            toast.success('Key copied')
          }}
        >
          <Copy /> Copy key
        </Button>
        <Button size="xs" variant="ghost" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  )
}

function KeyRow({ apiKey }: { apiKey: ListedApiKey }) {
  const { pending, run } = useRun()
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {apiKey.name} <span className="font-mono text-xs font-normal text-muted-foreground">{apiKey.prefix}…</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {apiKey.scopes.join(', ')}
          {apiKey.product ? ` on ${apiKey.product.name}` : ''} · {apiKey.lastUsedAt ? `last used ${formatRelative(apiKey.lastUsedAt)}` : 'never used'}
          {apiKey.revokedAt ? ` · revoked ${formatRelative(apiKey.revokedAt)}` : !apiKey.createdBy && ' · maker unknown'}
        </p>
      </div>
      {!apiKey.revokedAt && (
        <Button variant="ghost" size="xs" loading={pending} onClick={() => confirm(`Revoke ${apiKey.name}? Whatever reads with it stops at its next request.`) && run(() => revokeApiKeyOfWorkspace(apiKey.id))}>
          Revoke
        </Button>
      )}
    </li>
  )
}

export function ApiKeyControls({ keys }: { keys: ListedApiKey[] }) {
  const { pending, run } = useRun()
  const [name, setName] = useState('')
  const [revealed, setRevealed] = useState<string | null>(null)
  return (
    <div className="space-y-3">
      {revealed && <RevealedKey apiKey={revealed} onDone={() => setRevealed(null)} />}
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          run(async () => {
            const { key } = await createApiKeyOfWorkspace(name)
            setRevealed(key)
            setName('')
          })
        }}
      >
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="What will use it" aria-label="Key name" className="h-9 flex-1" />
        <Button type="submit" loading={pending} disabled={!name.trim()}>
          <Plus /> New key
        </Button>
      </form>
      {keys.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {keys.map((apiKey) => (
            <KeyRow key={apiKey.id} apiKey={apiKey} />
          ))}
        </ul>
      )}
    </div>
  )
}
