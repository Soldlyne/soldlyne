'use client'

import { useOptimistic, useTransition } from 'react'
import { toast } from 'sonner'
import type { Stage } from '@prisma/client'
import { cn } from '@/lib/utils'

/** The deal's stages as a clickable progress bar. */
export function StageBar({ stages, current, save }: { stages: Stage[]; current: string; save: (patch: Record<string, unknown>) => Promise<unknown> }) {
  const [optimistic, setOptimistic] = useOptimistic(current)
  const [, startTransition] = useTransition()
  const index = stages.findIndex((stage) => stage.id === optimistic)
  const currentStage = stages[index]

  return (
    <div className="flex gap-1 overflow-x-auto" role="list" aria-label="Stage">
      {stages.map((stage, i) => {
        const reached = currentStage?.kind === 'OPEN' ? i <= index : stage.id === optimistic
        return (
          <button
            key={stage.id}
            type="button"
            role="listitem"
            aria-current={stage.id === optimistic ? 'step' : undefined}
            onClick={() =>
              startTransition(async () => {
                setOptimistic(stage.id)
                try {
                  await save({ stageId: stage.id })
                } catch {
                  toast.error('Could not change the stage')
                }
              })
            }
            className={cn(
              'min-w-20 flex-1 rounded-md border px-2 py-1.5 text-xs font-medium whitespace-nowrap transition-colors',
              reached && stage.kind === 'OPEN' && stage.id !== optimistic && 'border-transparent bg-accent text-accent-foreground',
              reached && stage.kind === 'OPEN' && stage.id === optimistic && 'border-primary bg-primary text-primary-foreground',
              reached && stage.kind === 'WON' && 'border-success bg-success text-primary-foreground',
              reached && stage.kind === 'LOST' && 'border-destructive bg-destructive text-destructive-foreground',
              !reached && 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {stage.name}
          </button>
        )
      })}
    </div>
  )
}
