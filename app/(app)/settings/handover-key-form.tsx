'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRun } from '@/hooks/ui/use-run'
import { createHandoverKeyOfWorkspace } from '@/lib/api/actions'
import { RevealedKey } from './api-key-controls'

/** The key Coldlyne connects with: what it may do, and the product its deals open on. It's made here alone: an assistant's tools only make keys that read. */
export function HandoverKeyForm({ products }: { products: { id: string; label: string }[] }) {
  const { pending, run } = useRun()
  const [productId, setProductId] = useState('')
  const [revealed, setRevealed] = useState<string | null>(null)
  const product = products.find(({ id }) => id === productId)
  return (
    <div className="mt-6 space-y-3 border-t pt-4">
      <div>
        <p className="text-sm font-medium">Key for Coldlyne</p>
        <p className="text-sm text-muted-foreground">
          Lets Coldlyne turn someone who replied into a company, a person and a deal on the product you choose, and ask who your customers and open deals are, so they&apos;re never prospected. It can&apos;t read your pipeline or change what you wrote, and nothing it does contacts anyone. Paste it on Coldlyne&apos;s Connections page, with this site&apos;s address.
        </p>
      </div>
      {revealed && <RevealedKey apiKey={revealed} onDone={() => setRevealed(null)} />}
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          run(async () => {
            const { key } = await createHandoverKeyOfWorkspace(`Coldlyne: ${product?.label}`, productId)
            setRevealed(key)
          })
        }}
      >
        <select value={productId} onChange={(event) => setProductId(event.target.value)} aria-label="Product its deals open on" className="h-9 flex-1 rounded-md border bg-background px-2 text-sm">
          <option value="">Product its deals open on…</option>
          {products.map(({ id, label }) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <Button type="submit" loading={pending} disabled={!productId}>
          <Plus /> New key for Coldlyne
        </Button>
      </form>
    </div>
  )
}
