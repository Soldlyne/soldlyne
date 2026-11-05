'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'

/** Runs a server action in a transition and toasts its error. */
export function useRun() {
  const [pending, startTransition] = useTransition()
  const run = (fn: () => Promise<unknown>, onDone?: () => void) =>
    startTransition(async () => {
      try {
        await fn()
        onDone?.()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Something went wrong')
      }
    })
  return { pending, run }
}
