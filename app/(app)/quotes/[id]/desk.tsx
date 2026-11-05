'use client'

import { createContext, useContext, useMemo, useState } from 'react'

const Desk = createContext<{ unsaved: boolean; setUnsaved: (unsaved: boolean) => void }>({ unsaved: false, setUnsaved: () => {} })

/** What the editor and the toolbar share: changes not saved yet mustn't be previewed or sent as if they were. */
export function QuoteDesk({ children }: { children: React.ReactNode }) {
  const [unsaved, setUnsaved] = useState(false)
  const value = useMemo(() => ({ unsaved, setUnsaved }), [unsaved])
  return <Desk.Provider value={value}>{children}</Desk.Provider>
}

export const useDesk = () => useContext(Desk)
