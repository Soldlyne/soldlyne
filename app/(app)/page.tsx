import type { Metadata } from 'next'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { endOfToday, taskInclude } from '@/lib/crm/queries'
import { ACTIVITY_LABELS, formatDateTime, formatMoney, formatRelative, now, personName } from '@/lib/crm/format'
import { getSession } from '@/lib/session'
import { TaskItem } from '@/components/crm/task-list'
import { Panel } from '@/components/crm/record-layout'

export const metadata: Metadata = { title: 'Home' }

const STALE_DAYS = 14

export default async function HomePage() {
  const session = await getSession()
  const current = now()
  const live = { deletedAt: null }
  const [due, openDeals, recent, wonThisMonth, meetings] = await Promise.all([
    prisma.task.findMany({
      where: { completedAt: null, dueAt: { lte: endOfToday() } },
      orderBy: { dueAt: 'asc' },
      include: taskInclude,
    }),
    prisma.deal.findMany({
      where: { ...live, stage: { kind: 'OPEN' } },
      include: { stage: true, product: true, company: { select: { name: true } }, tasks: { where: { completedAt: null }, select: { id: true } } },
    }),
    prisma.activity.findMany({
      orderBy: { occurredAt: 'desc' },
      take: 12,
      include: {
        participants: { include: { person: { select: { id: true, firstName: true, lastName: true, emails: true } } } },
        company: { select: { id: true, name: true } },
      },
    }),
    prisma.deal.aggregate({
      where: { ...live, stage: { kind: 'WON' }, closedAt: { gte: new Date(current.getFullYear(), current.getMonth(), 1) } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.activity.findMany({
      where: { type: 'MEETING', occurredAt: { gte: current, lte: new Date(current.getTime() + 7 * 86_400_000) } },
      orderBy: { occurredAt: 'asc' },
      take: 10,
      include: { participants: { include: { person: { select: { id: true, firstName: true, lastName: true, emails: true } } } }, company: { select: { id: true, name: true } } },
    }),
  ])

  const noNextStep = openDeals.filter((deal) => deal.tasks.length === 0)
  const stale = openDeals.filter((deal) => current.getTime() - deal.stageEnteredAt.getTime() > STALE_DAYS * 86_400_000)
  const openValue = openDeals.reduce((sum, deal) => sum + Number(deal.amount ?? 0), 0)
  const weighted = openDeals.reduce((sum, deal) => sum + (Number(deal.amount ?? 0) * (deal.probability ?? deal.stage.probability)) / 100, 0)
  const greeting = current.getHours() < 12 ? 'Good morning' : current.getHours() < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 p-4 lg:p-8">
      <div>
        <h1 className="text-xl font-semibold">
          {greeting}, {session?.user.name.split(' ')[0]}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {due.length === 0 ? 'Nothing due today.' : `${due.length} follow-up${due.length > 1 ? 's' : ''} due today or overdue.`}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
        {[
          ['Open deals', String(openDeals.length)],
          ['Pipeline', formatMoney(openValue)],
          ['Weighted', formatMoney(Math.round(weighted))],
          ['Won this month', formatMoney(wonThisMonth._sum.amount ?? 0)],
        ].map(([label, value]) => (
          <div key={label} className="bg-card p-4">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="num mt-1 text-lg font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-8">
          <Panel title="Due today" action={<Link href="/tasks" className="text-xs text-muted-foreground hover:text-foreground">All tasks</Link>}>
            {due.length === 0 ? (
              <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">You are clear. Plan the next touches from your deals.</p>
            ) : (
              <div className="rounded-lg border p-1">
                {due.map((task) => (
                  <TaskItem key={task.id} task={task} showContext />
                ))}
              </div>
            )}
          </Panel>
          {noNextStep.length > 0 && (
            <Panel title={`Open deals without a next step · ${noNextStep.length}`}>
              <div className="divide-y rounded-lg border">
                {noNextStep.map((deal) => (
                  <Link key={deal.id} href={`/deals/${deal.id}`} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent/50">
                    <span className="size-2 rounded-full" style={{ backgroundColor: deal.product.color }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-medium">{deal.name}</span>
                    <span className="text-xs text-muted-foreground">{deal.stage.name}</span>
                  </Link>
                ))}
              </div>
            </Panel>
          )}
          {stale.length > 0 && (
            <Panel title={`Stuck for ${STALE_DAYS}+ days · ${stale.length}`}>
              <div className="divide-y rounded-lg border">
                {stale.map((deal) => (
                  <Link key={deal.id} href={`/deals/${deal.id}`} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent/50">
                    <span className="size-2 rounded-full" style={{ backgroundColor: deal.product.color }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-medium">{deal.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {deal.stage.name} since {formatRelative(deal.stageEnteredAt)}
                    </span>
                  </Link>
                ))}
              </div>
            </Panel>
          )}
        </div>
        <div className="space-y-8">
        {meetings.length > 0 && (
          <Panel title="Upcoming meetings">
            <ul className="space-y-3">
              {meetings.map((meeting) => {
                const person = meeting.participants.find((p) => p.person)?.person
                return (
                  <li key={meeting.id} className="text-sm">
                    <span className="font-medium">{meeting.subject}</span>
                    <span className="block text-xs text-muted-foreground">
                      {formatDateTime(meeting.occurredAt)}
                      {person && (
                        <>
                          {' · '}
                          <Link href={`/people/${person.id}`} className="hover:underline">
                            {personName(person)}
                          </Link>
                        </>
                      )}
                      {meeting.company ? ` · ${meeting.company.name}` : ''}
                    </span>
                  </li>
                )
              })}
            </ul>
          </Panel>
        )}
        <Panel title="Recent activity">
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No interaction logged yet.</p>
          ) : (
            <ul className="space-y-3">
              {recent.map((activity) => {
                const person = activity.participants.find((p) => p.person)?.person
                return (
                  <li key={activity.id} className="text-sm">
                    <span className="font-medium">{ACTIVITY_LABELS[activity.type]}</span>
                    {person && (
                      <>
                        {' '}with{' '}
                        <Link href={`/people/${person.id}`} className="hover:underline">
                          {personName(person)}
                        </Link>
                      </>
                    )}
                    {activity.company && (
                      <>
                        {' · '}
                        <Link href={`/companies/${activity.company.id}`} className="text-muted-foreground hover:underline">
                          {activity.company.name}
                        </Link>
                      </>
                    )}
                    <span className="block text-xs text-muted-foreground">
                      {formatRelative(activity.occurredAt)}
                      {activity.outcome ? ` · ${activity.outcome}` : ''}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>
        </div>
      </div>
    </div>
  )
}
