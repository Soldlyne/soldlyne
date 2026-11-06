'use client'

import { useOptimistic, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import type { Stage } from '@prisma/client'
import type { DealRow } from '@/lib/crm/queries'
import { moveDeal } from '@/lib/crm/actions'
import { formatDue, formatMoney, personName } from '@/lib/crm/format'
import { cn } from '@/lib/utils'

const STALE_DAYS = 14

export function PipelineBoard({
  title,
  color,
  deals,
  stages,
  showProduct = false,
  actions,
  filters,
  now,
}: {
  filters?: React.ReactNode
  /** Render time from the server, for "stale" badges. */
  now: number
  title: string
  color?: string
  deals: DealRow[]
  stages: Stage[]
  showProduct?: boolean
  actions?: React.ReactNode
}) {
  const [optimistic, applyMove] = useOptimistic(deals, (state, move: { id: string; stageId: string; position: number }) =>
    state.map((deal) => (deal.id === move.id ? { ...deal, stageId: move.stageId, position: move.position } : deal)),
  )
  const [, startTransition] = useTransition()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const open = optimistic.filter((deal) => stages.find((s) => s.id === deal.stageId)?.kind === 'OPEN')
  const openTotal = open.reduce((sum, deal) => sum + Number(deal.amount ?? 0), 0)
  const weighted = open.reduce((sum, deal) => {
    const stage = stages.find((s) => s.id === deal.stageId)
    return sum + (Number(deal.amount ?? 0) * (deal.probability ?? stage?.probability ?? 0)) / 100
  }, 0)

  function onDragEnd(event: DragEndEvent) {
    const id = String(event.active.id)
    const stageId = event.over ? String(event.over.id) : null
    const deal = optimistic.find((d) => d.id === id)
    if (!deal || !stageId || stageId === deal.stageId) return
    // Dropped cards go to the top of their new column.
    const top = Math.min(0, ...optimistic.filter((d) => d.stageId === stageId).map((d) => d.position))
    const position = top - 1
    startTransition(async () => {
      applyMove({ id, stageId, position })
      try {
        await moveDeal(id, stageId, position)
      } catch {
        toast.error('Could not move the deal')
      }
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3 lg:px-6">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          {color && <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden />}
          {title}
        </h1>
        <p className="num text-sm text-muted-foreground">
          {open.length} open · {formatMoney(openTotal * 1)} · weighted {formatMoney(Math.round(weighted))}
        </p>
        {filters}
        <div className="ml-auto">{actions}</div>
      </div>
      <DndContext id="pipeline-board" sensors={sensors} onDragEnd={onDragEnd}>
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-4 lg:px-6">
          {stages.map((stage) => (
            <Column
              key={stage.id}
              stage={stage}
              deals={optimistic.filter((deal) => deal.stageId === stage.id).sort((a, b) => a.position - b.position)}
              showProduct={showProduct}
              now={now}
            />
          ))}
        </div>
      </DndContext>
    </div>
  )
}

function Column({ stage, deals, showProduct, now }: { stage: Stage; deals: DealRow[]; showProduct: boolean; now: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id })
  const total = deals.reduce((sum, deal) => sum + Number(deal.amount ?? 0), 0)
  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span
          className={cn(
            'size-2 rounded-full',
            stage.kind === 'WON' ? 'bg-success' : stage.kind === 'LOST' ? 'bg-destructive' : 'bg-muted-foreground/40',
          )}
          aria-hidden
        />
        <h2 className="text-sm font-medium">{stage.name}</h2>
        <span className="num text-xs text-muted-foreground">{deals.length}</span>
        {total > 0 && <span className="num ml-auto text-xs text-muted-foreground">{formatMoney(total)}</span>}
      </div>
      <div
        ref={setNodeRef}
        className={cn('flex min-h-24 flex-1 flex-col gap-2 rounded-lg bg-surface p-1.5 transition-colors', isOver && 'bg-accent ring-2 ring-ring/40')}
      >
        {deals.map((deal) => (
          <Card key={deal.id} deal={deal} stage={stage} showProduct={showProduct} now={now} />
        ))}
      </div>
    </div>
  )
}

function Card({ deal, stage, showProduct, now }: { deal: DealRow; stage: Stage; showProduct: boolean; now: number }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id })
  const next = deal.tasks[0]
  const today = new Date(new Date(now).toDateString())
  const overdue = next?.dueAt && new Date(next.dueAt) < today
  const stale = stage.kind === 'OPEN' && now - new Date(deal.stageEnteredAt).getTime() > STALE_DAYS * 86_400_000
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        'cursor-grab rounded-md border bg-card p-2.5 text-sm shadow-xs active:cursor-grabbing',
        isDragging && 'z-50 shadow-lg ring-2 ring-ring/40',
      )}
    >
      <div className="flex items-start gap-2">
        <Link href={`/deals/${deal.id}`} className="min-w-0 flex-1 font-medium hover:underline" onPointerDown={(event) => event.stopPropagation()}>
          {deal.name}
        </Link>
        {showProduct && (
          <span className="mt-0.5 shrink-0 rounded border px-1 text-[10px] text-muted-foreground" title={deal.product.project?.name ?? deal.product.name}>
            {deal.product.name}
          </span>
        )}
      </div>
      {(deal.company || deal.contact) && (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {deal.company?.name}
          {deal.company && deal.contact ? ' · ' : ''}
          {deal.contact && personName(deal.contact)}
        </p>
      )}
      <div className="mt-2 flex items-center gap-2 text-xs">
        {deal.amount !== null && <span className="num font-medium">{formatMoney(deal.amount, deal.currency)}</span>}
        <span className={cn('ml-auto truncate', overdue ? 'font-medium text-destructive' : 'text-muted-foreground')}>
          {next ? `${formatDue(next.dueAt) || 'To do'} · ${next.title}` : stage.kind === 'OPEN' ? <span className="text-warning">No next step</span> : null}
        </span>
      </div>
      {stale && <p className="mt-1 text-xs text-warning">In this stage for {Math.floor((now - new Date(deal.stageEnteredAt).getTime()) / 86_400_000)} days</p>}
    </div>
  )
}
