'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, CheckSquare, Handshake, KanbanSquare, Search, Upload, User } from 'lucide-react'
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'

type Result = { type: 'company' | 'person' | 'deal'; id: string; title: string; subtitle: string; href: string }

const ICONS = { company: Building2, person: User, deal: Handshake }
const PAGES = [
  { title: 'Pipeline', href: '/pipeline', icon: KanbanSquare },
  { title: 'Tasks', href: '/tasks', icon: CheckSquare },
  { title: 'Companies', href: '/companies', icon: Building2 },
  { title: 'People', href: '/people', icon: User },
  { title: 'Deals', href: '/deals', icon: Handshake },
  { title: 'Import a CSV', href: '/import', icon: Upload },
]

export function CommandMenu() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((value) => !value)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!query.trim()) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        if (response.ok) setResults((await response.json()).results)
      } catch {}
    }, 120)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  const go = (href: string) => {
    setOpen(false)
    setQuery('')
    router.push(href)
  }
  const shown = query.trim() ? results : []

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-8 w-full max-w-sm items-center gap-2 rounded-md border bg-surface px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent"
      >
        <Search className="size-4" aria-hidden />
        <span className="flex-1 text-left">Search</span>
        <kbd className="hidden rounded border bg-background px-1.5 font-mono text-[11px] sm:inline">⌘K</kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false}>
        <CommandInput placeholder="Search companies, people, deals..." value={query} onValueChange={setQuery} />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          {shown.length > 0 && (
            <CommandGroup heading="Records">
              {shown.map((result) => {
                const Icon = ICONS[result.type]
                return (
                  <CommandItem key={`${result.type}-${result.id}`} value={`${result.type}-${result.id}`} onSelect={() => go(result.href)}>
                    <Icon className="text-muted-foreground" />
                    <span className="truncate">{result.title}</span>
                    <span className="ml-auto truncate text-xs text-muted-foreground">{result.subtitle}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          )}
          {!query.trim() && (
            <CommandGroup heading="Go to">
              {PAGES.map((page) => (
                <CommandItem key={page.href} value={page.href} onSelect={() => go(page.href)}>
                  <page.icon className="text-muted-foreground" />
                  {page.title}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  )
}
