'use client'

import { createContext, useContext, useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'

type Selection = { selected: Set<string>; toggle: (id: string) => void; setAll: (ids: string[] | null) => void }

const SelectionContext = createContext<Selection | null>(null)

export function SelectionProvider({ children }: { children: React.ReactNode }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const setAll = (ids: string[] | null) => setSelected(new Set(ids ?? []))
  return <SelectionContext.Provider value={{ selected, toggle, setAll }}>{children}</SelectionContext.Provider>
}

export function useSelection() {
  const context = useContext(SelectionContext)
  if (!context) throw new Error('useSelection outside SelectionProvider')
  return context
}

export function RowCheck({ id }: { id: string }) {
  const { selected, toggle } = useSelection()
  return <Checkbox checked={selected.has(id)} onCheckedChange={() => toggle(id)} aria-label="Select row" />
}

export function AllCheck({ ids }: { ids: string[] }) {
  const { selected, setAll } = useSelection()
  const all = ids.length > 0 && ids.every((id) => selected.has(id))
  const some = !all && ids.some((id) => selected.has(id))
  return <Checkbox checked={all ? true : some ? 'indeterminate' : false} onCheckedChange={() => setAll(all ? null : ids)} aria-label="Select all" />
}
