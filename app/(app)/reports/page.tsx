import type { Metadata } from 'next'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { activity, channels, funnel, kpis, period } from '@/lib/reports'
import { ACTIVITY_LABELS, formatMoney, now } from '@/lib/crm/format'
import { Panel } from '@/components/crm/record-layout'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Reports' }

const PERIODS = [
  [30, '30 days'],
  [90, '90 days'],
  [365, '12 months'],
] as const

function pct(value: number | null) {
  return value === null ? '–' : `${Math.round(value * 100)}%`
}

/** A horizontal bar with its value as text: one hue, magnitude only. */
function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  return (
    <div className="flex items-center gap-2" title={label}>
      <div className="h-2 flex-1 rounded-full bg-muted">
        <div className="h-2 rounded-full bg-chart-1" style={{ width: `${max ? Math.max((value / max) * 100, value ? 2 : 0) : 0}%` }} />
      </div>
    </div>
  )
}

export default async function ReportsPage({ searchParams }: PageProps<'/reports'>) {
  const params = await searchParams
  const days = Number(params.days) || 90
  const projectId = params.project?.toString()
  const p = period(days, now())
  const [k, f, c, a, projects] = await Promise.all([
    kpis(p, projectId),
    funnel(p, projectId),
    channels(p, projectId),
    activity(p),
    prisma.project.findMany({ where: { archived: false }, orderBy: { position: 'asc' } }),
  ])
  const href = (next: { days?: number; project?: string | null }) => {
    const q = new URLSearchParams()
    q.set('days', String(next.days ?? days))
    const project = next.project === undefined ? projectId : next.project
    if (project) q.set('project', project)
    return `/reports?${q}`
  }
  const chip = (active: boolean) => cn('rounded-md border px-2 py-1 text-xs', active ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent')
  const weekMax = Math.max(1, ...a.perWeek.map((w) => w.outbound + w.inbound))
  const funnelMax = Math.max(1, ...f.rows.map((r) => r.count))
  const channelMax = Math.max(1, ...c.map((r) => r.deals))

  return (
    <div className="mx-auto w-full max-w-5xl space-y-10 p-4 lg:p-8">
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">Reports</h1>
        <div className="flex flex-wrap gap-1">
          {PERIODS.map(([value, label]) => (
            <Link key={value} href={href({ days: value })} className={chip(days === value)}>
              {label}
            </Link>
          ))}
          {projects.length > 0 && (
            <>
              <span className="mx-2 w-px bg-border" aria-hidden />
              <Link href={href({ project: null })} className={chip(!projectId)}>
                All projects
              </Link>
              {projects.map((project) => (
                <Link key={project.id} href={href({ project: project.id })} className={chip(projectId === project.id)}>
                  {project.name}
                </Link>
              ))}
            </>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
        {[
          ['New deals', String(k.created)],
          ['Won', `${k.won} · ${formatMoney(k.wonValue)}`],
          ['Win rate', pct(k.winRate)],
          ['Sales cycle', k.cycleDays === null ? '–' : `${k.cycleDays} days`],
          ['Lost', String(k.lost)],
          ['Open pipeline', formatMoney(k.openValue)],
          ['Weighted', formatMoney(k.weighted)],
          ['Email reply rate', pct(a.emailReplyRate)],
        ].map(([label, value]) => (
          <div key={label} className="bg-card p-4">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="num mt-1 text-lg font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-10 lg:grid-cols-2">
        <Panel title={`Funnel · ${f.total} deals created`}>
          {f.total === 0 ? (
            <p className="text-sm text-muted-foreground">No deal created in this period.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {f.rows.map((row, i) => {
                  const previous = i > 0 ? f.rows[i - 1].count : null
                  return (
                    <tr key={row.stage}>
                      <td className="w-28 py-1.5 pr-2">{row.stage}</td>
                      <td className="py-1.5">
                        <Bar value={row.count} max={funnelMax} label={`${row.stage}: ${row.count} deals`} />
                      </td>
                      <td className="num w-10 py-1.5 text-right">{row.count}</td>
                      <td className="num w-14 py-1.5 text-right text-xs text-muted-foreground">{previous ? pct(row.count / previous) : ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          <p className="mt-2 text-xs text-muted-foreground">Deals created in the period that reached each stage; the last column is the conversion from the stage above.</p>
        </Panel>

        <Panel title="Channels">
          {c.length === 0 ? (
            <p className="text-sm text-muted-foreground">No deal in this period.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-1 font-medium">Source</th>
                  <th className="pb-1 font-medium" />
                  <th className="pb-1 text-right font-medium">Deals</th>
                  <th className="pb-1 text-right font-medium">Won</th>
                  <th className="pb-1 text-right font-medium">Win rate</th>
                  <th className="pb-1 text-right font-medium">Won value</th>
                </tr>
              </thead>
              <tbody>
                {c.map((row) => (
                  <tr key={row.channel}>
                    <td className="py-1.5 pr-2">{row.channel}</td>
                    <td className="w-24 py-1.5">
                      <Bar value={row.deals} max={channelMax} label={`${row.channel}: ${row.deals} deals`} />
                    </td>
                    <td className="num py-1.5 text-right">{row.deals}</td>
                    <td className="num py-1.5 text-right">{row.won}</td>
                    <td className="num py-1.5 text-right">{pct(row.winRate)}</td>
                    <td className="num py-1.5 text-right">{formatMoney(row.wonValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      <Panel title="Activity · last 12 weeks">
        <div className="flex h-36 items-end gap-1.5" role="img" aria-label="Touches per week, last 12 weeks">
          {a.perWeek.map((week) => {
            const total = week.outbound + week.inbound
            const label = `Week of ${week.start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}: ${week.outbound} outbound, ${week.inbound} inbound`
            return (
              <div key={week.start.toISOString()} className="group flex h-full flex-1 flex-col justify-end" title={label}>
                <span className="num mb-1 text-center text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100">{total}</span>
                <div className="rounded-t bg-chart-1 transition-opacity group-hover:opacity-80" style={{ height: `${(total / weekMax) * 100}%`, minHeight: total ? 2 : 0 }} />
              </div>
            )
          })}
        </div>
        <div className="mt-1 flex gap-1.5 text-[10px] text-muted-foreground">
          {a.perWeek.map((week, i) => (
            <span key={week.start.toISOString()} className="flex-1 text-center">
              {i % 2 === 0 ? week.start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}
            </span>
          ))}
        </div>
        <table className="mt-4 w-full max-w-md text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="pb-1 font-medium">In the period</th>
              <th className="pb-1 text-right font-medium">Outbound</th>
              <th className="pb-1 text-right font-medium">Inbound</th>
            </tr>
          </thead>
          <tbody>
            {a.byType.length === 0 && (
              <tr>
                <td colSpan={3} className="py-1.5 text-muted-foreground">
                  No activity logged.
                </td>
              </tr>
            )}
            {a.byType.map((row) => (
              <tr key={row.type}>
                <td className="py-1">{ACTIVITY_LABELS[row.type as keyof typeof ACTIVITY_LABELS] ?? row.type}</td>
                <td className="num py-1 text-right">{row.outbound}</td>
                <td className="num py-1 text-right">{row.inbound}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  )
}
