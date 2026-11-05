'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { Trash2, X } from 'lucide-react'
import { bulkCompanies, bulkDeals, bulkPeople } from '@/lib/crm/bulk'
import { Button } from '@/components/ui/button'
import { useSelection } from './selection'

type Option = { id: string; name: string }

/** Actions on the selected rows; floats at the bottom while something is selected. */
export function BulkBar({ object, stages = [] }: { object: 'COMPANY' | 'PERSON' | 'DEAL'; stages?: Option[] }) {
  const { selected, setAll } = useSelection()
  const [pending, startTransition] = useTransition()
  if (selected.size === 0) return null
  const ids = [...selected]

  const run = (fn: () => Promise<unknown>, done: string) =>
    startTransition(async () => {
      try {
        await fn()
        toast.success(done)
        setAll(null)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Bulk action failed')
      }
    })

  const select = 'h-8 rounded-md border bg-background px-2 text-xs'

  return (
    <div className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-popover px-3 py-2 shadow-lg">
        <span className="num text-sm font-medium">{selected.size} selected</span>
        {object === 'DEAL' && (
          <select className={select} value="" disabled={pending} onChange={(e) => e.target.value && run(() => bulkDeals({ ids, stageId: e.target.value }), 'Stage changed')} aria-label="Move to stage">
            <option value="">Move to stage…</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        {object === 'COMPANY' && (
          <select
            className={select}
            value=""
            disabled={pending}
            onChange={(e) => e.target.value && run(() => bulkCompanies({ ids, priority: e.target.value === 'none' ? null : e.target.value }), 'Priority set')}
            aria-label="Set priority"
          >
            <option value="">Set priority…</option>
            {['A', 'B', 'C'].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
            <option value="none">None</option>
          </select>
        )}
        <Button
          variant="ghost"
          size="xs"
          disabled={pending}
          onClick={() =>
            confirm(`Delete ${selected.size} record${selected.size > 1 ? 's' : ''}?`) &&
            run(() => (object === 'PERSON' ? bulkPeople({ ids, delete: true }) : object === 'COMPANY' ? bulkCompanies({ ids, delete: true }) : bulkDeals({ ids, delete: true })), 'Deleted')
          }
        >
          <Trash2 /> Delete
        </Button>
        <Button variant="ghost" size="icon-xs" onClick={() => setAll(null)} aria-label="Clear selection">
          <X />
        </Button>
      </div>
    </div>
  )
}
