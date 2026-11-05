'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Bookmark, Search, X } from 'lucide-react'
import { deleteView, saveView } from '@/lib/crm/bulk'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type Facet = { key: string; label: string; options: { value: string; label: string }[] }
export type SavedView = { id: string; name: string; query: string }

/** Search, quick filters and saved views. Everything lives in the URL. */
export function FilterBar({ object, facets, views, placeholder }: { object: 'COMPANY' | 'PERSON' | 'DEAL'; facets: Facet[]; views: SavedView[]; placeholder?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [q, setQ] = useState(params.get('q') ?? '')
  const [viewName, setViewName] = useState('')

  const current = new URLSearchParams(params)
  current.delete('view')
  const query = [...current.entries()].filter(([, v]) => v).sort(([a], [b]) => a.localeCompare(b))
  const queryString = new URLSearchParams(query).toString()
  const activeView = views.find((v) => v.query === queryString)

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    router.replace(`${pathname}${next.size ? `?${next}` : ''}`)
  }

  return (
    <div className="space-y-2 border-b px-4 py-2 lg:px-6">
      <div className="flex flex-wrap items-center gap-1">
        <Link href={pathname} className={cn('rounded-md px-2 py-1 text-xs font-medium', !queryString ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground')}>
          All
        </Link>
        {views.map((view) => (
          <span key={view.id} className="group inline-flex items-center">
            <Link
              href={`${pathname}?${view.query}`}
              className={cn('rounded-md px-2 py-1 text-xs font-medium', activeView?.id === view.id ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              {view.name}
            </Link>
            <button
              type="button"
              aria-label={`Delete view ${view.name}`}
              onClick={() => confirm(`Delete the view "${view.name}"?`) && startTransition(() => deleteView(view.id))}
              className="hidden rounded p-0.5 text-muted-foreground hover:text-foreground group-hover:inline"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        {queryString && !activeView && (
          <form
            className="flex items-center gap-1"
            onSubmit={(event) => {
              event.preventDefault()
              if (!viewName.trim()) return
              startTransition(async () => {
                try {
                  await saveView(object, viewName, queryString)
                  setViewName('')
                } catch {
                  toast.error('Could not save the view')
                }
              })
            }}
          >
            <input
              value={viewName}
              onChange={(e) => setViewName(e.target.value)}
              placeholder="Name this view"
              aria-label="View name"
              className="h-7 w-36 rounded-md border bg-background px-2 text-xs"
            />
            <Button variant="ghost" size="xs" type="submit" loading={pending} disabled={!viewName.trim()}>
              <Bookmark /> Save view
            </Button>
          </form>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <form
          className="relative"
          onSubmit={(event) => {
            event.preventDefault()
            set('q', q.trim())
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onBlur={() => q.trim() !== (params.get('q') ?? '') && set('q', q.trim())}
            placeholder={placeholder ?? 'Search'}
            className="h-8 w-56 rounded-md border bg-background pr-2 pl-8 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        </form>
        {facets.filter((facet) => facet.options.length > 0).map((facet) => {
          const value = params.get(facet.key) ?? ''
          return (
            <select
              key={facet.key}
              value={value}
              onChange={(e) => set(facet.key, e.target.value)}
              aria-label={facet.label}
              className={cn('h-8 rounded-md border bg-background px-2 text-xs', value && 'border-primary font-medium')}
            >
              <option value="">{facet.label}</option>
              {facet.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )
        })}
        {queryString && (
          <Link href={pathname} className="text-xs text-muted-foreground hover:text-foreground">
            Clear
          </Link>
        )}
      </div>
    </div>
  )
}

export const CONTACT_OPTIONS = [
  { value: 'never', label: 'Never contacted' },
  { value: '7d', label: 'Contacted in 7 days' },
  { value: '30d', label: 'Contacted in 30 days' },
  { value: '30d+', label: 'Not contacted for 30+ days' },
]
