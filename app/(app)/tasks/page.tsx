import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { endOfToday, taskInclude } from '@/lib/crm/queries'
import { now } from '@/lib/crm/format'
import { TaskItem } from '@/components/crm/task-list'
import { Panel } from '@/components/crm/record-layout'

export const metadata: Metadata = { title: 'Tasks' }

export default async function TasksPage() {
  const today = endOfToday()
  const weekEnd = new Date(today.getTime() + 7 * 86_400_000)
  const tasks = await prisma.task.findMany({
    where: { OR: [{ completedAt: null }, { completedAt: { gte: new Date(now().getTime() - 7 * 86_400_000) } }] },
    orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    include: taskInclude,
  })
  const open = tasks.filter((task) => !task.completedAt)
  const groups = [
    { title: 'Today and overdue', items: open.filter((t) => t.dueAt && t.dueAt <= today) },
    { title: 'Next 7 days', items: open.filter((t) => t.dueAt && t.dueAt > today && t.dueAt <= weekEnd) },
    { title: 'Later', items: open.filter((t) => t.dueAt && t.dueAt > weekEnd) },
    { title: 'No date', items: open.filter((t) => !t.dueAt) },
    { title: 'Done this week', items: tasks.filter((t) => t.completedAt) },
  ]
  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 p-4 lg:p-8">
      <h1 className="text-xl font-semibold">Tasks</h1>
      {open.length === 0 && <p className="text-sm text-muted-foreground">No open task. Add next steps from a deal, a company or a person.</p>}
      {groups
        .filter((group) => group.items.length > 0)
        .map((group) => (
          <Panel key={group.title} title={`${group.title} · ${group.items.length}`}>
            <div className="rounded-lg border p-1">
              {group.items.map((task) => (
                <TaskItem key={task.id} task={task} showContext />
              ))}
            </div>
          </Panel>
        ))}
    </div>
  )
}
