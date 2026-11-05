'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import type { TaskRow } from '@/lib/crm/queries'
import { createTask, deleteTask, setTaskDone } from '@/lib/crm/actions'
import { formatDue, personName } from '@/lib/crm/format'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function dueState(dueAt: Date | null, done: boolean) {
  if (done || !dueAt) return 'none'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dueAt)
  due.setHours(0, 0, 0, 0)
  if (due < today) return 'overdue'
  if (due.getTime() === today.getTime()) return 'today'
  return 'later'
}

export function TaskItem({ task, showContext = false }: { task: TaskRow; showContext?: boolean }) {
  const [pending, startTransition] = useTransition()
  const done = Boolean(task.completedAt)
  const state = dueState(task.dueAt, done)
  const context = task.deal
    ? { href: `/deals/${task.deal.id}`, label: task.deal.name }
    : task.person
      ? { href: `/people/${task.person.id}`, label: personName(task.person) }
      : task.company
        ? { href: `/companies/${task.company.id}`, label: task.company.name }
        : null

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      try {
        await fn()
      } catch {
        toast.error('Could not update the task')
      }
    })

  return (
    <div className={cn('group flex items-start gap-3 rounded-md px-2 py-1.5 hover:bg-accent/50', pending && 'opacity-60')}>
      <Checkbox className="mt-0.5" checked={done} onCheckedChange={(checked) => run(() => setTaskDone(task.id, checked === true))} aria-label="Done" />
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm', done && 'text-muted-foreground line-through')}>{task.title}</p>
        {showContext && context && (
          <Link href={context.href} className="text-xs text-muted-foreground hover:text-foreground hover:underline">
            {context.label}
            {task.company && task.deal ? ` · ${task.company.name}` : ''}
          </Link>
        )}
      </div>
      {task.dueAt && (
        <span
          className={cn(
            'shrink-0 text-xs text-muted-foreground',
            state === 'overdue' && 'font-medium text-destructive',
            state === 'today' && 'font-medium text-foreground',
          )}
        >
          {formatDue(task.dueAt)}
        </span>
      )}
      <button
        type="button"
        onClick={() => run(() => deleteTask(task.id))}
        className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
        aria-label="Delete task"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  )
}

export function TaskList({
  tasks,
  target,
}: {
  tasks: TaskRow[]
  target: { companyId?: string; personId?: string; dealId?: string }
}) {
  const [title, setTitle] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [showDone, setShowDone] = useState(false)
  const [pending, startTransition] = useTransition()
  const open = tasks.filter((task) => !task.completedAt)
  const closed = tasks.filter((task) => task.completedAt)

  const add = (event: React.FormEvent) => {
    event.preventDefault()
    if (!title.trim()) return
    startTransition(async () => {
      try {
        await createTask({ title, dueAt: dueAt ? new Date(dueAt + 'T09:00') : null, ...target })
        setTitle('')
        setDueAt('')
      } catch {
        toast.error('Could not add the task')
      }
    })
  }

  return (
    <div>
      {open.length === 0 && <p className="px-2 py-1 text-sm text-muted-foreground">No next step planned.</p>}
      {open.map((task) => (
        <TaskItem key={task.id} task={task} />
      ))}
      <form onSubmit={add} className="mt-1 flex items-center gap-1.5 px-1">
        <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Add a next step" className="h-8 border-0 shadow-none focus-visible:ring-0" />
        <Input type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} className="h-8 w-36" aria-label="Due date" />
        {title.trim() && (
          <Button type="submit" size="sm" loading={pending}>
            Add
          </Button>
        )}
      </form>
      {closed.length > 0 && (
        <div className="mt-2">
          <button type="button" onClick={() => setShowDone(!showDone)} className="px-2 text-xs text-muted-foreground hover:text-foreground">
            {showDone ? 'Hide' : 'Show'} {closed.length} done
          </button>
          {showDone && closed.map((task) => <TaskItem key={task.id} task={task} />)}
        </div>
      )}
    </div>
  )
}
