import 'server-only'
import { prisma } from '@/lib/prisma'
import { CHANNEL_LABELS } from '@/lib/crm/format'

const DAY = 86_400_000

export type Period = { days: number; from: Date; to: Date }

export function period(days: number, now = new Date()): Period {
  return { days, from: new Date(now.getTime() - days * DAY), to: now }
}

/** Headline numbers for the period. */
export async function kpis(p: Period, projectId?: string) {
  const product = projectId ? { product: { projectId } } : {}
  const [created, won, lost, open] = await Promise.all([
    prisma.deal.count({ where: { deletedAt: null, createdAt: { gte: p.from }, ...product } }),
    prisma.deal.findMany({ where: { deletedAt: null, stage: { kind: 'WON' }, closedAt: { gte: p.from }, ...product }, select: { amount: true, createdAt: true, closedAt: true } }),
    prisma.deal.count({ where: { deletedAt: null, stage: { kind: 'LOST' }, closedAt: { gte: p.from }, ...product } }),
    prisma.deal.findMany({ where: { deletedAt: null, stage: { kind: 'OPEN' }, ...product }, select: { amount: true, probability: true, stage: { select: { probability: true } } } }),
  ])
  const wonValue = won.reduce((s, d) => s + Number(d.amount ?? 0), 0)
  const cycles = won.filter((d) => d.closedAt).map((d) => (d.closedAt!.getTime() - d.createdAt.getTime()) / DAY)
  return {
    created,
    won: won.length,
    wonValue,
    lost,
    winRate: won.length + lost ? won.length / (won.length + lost) : null,
    cycleDays: cycles.length ? Math.round(cycles.reduce((a, b) => a + b, 0) / cycles.length) : null,
    openValue: open.reduce((s, d) => s + Number(d.amount ?? 0), 0),
    weighted: Math.round(open.reduce((s, d) => s + (Number(d.amount ?? 0) * (d.probability ?? d.stage.probability)) / 100, 0)),
  }
}

/**
 * Funnel of deals created in the period: how many reached each open stage
 * (their first stage, every later stage they moved through, and where they
 * are now), and how many were won.
 */
export async function funnel(p: Period, projectId?: string) {
  const stages = await prisma.stage.findMany({ orderBy: { position: 'asc' } })
  const deals = await prisma.deal.findMany({
    where: { deletedAt: null, createdAt: { gte: p.from }, ...(projectId ? { product: { projectId } } : {}) },
    select: { id: true, stage: { select: { name: true, kind: true, position: true } }, events: { where: { name: 'deal.stage_changed' }, select: { properties: true } } },
  })
  const position = new Map(stages.map((s) => [s.name, s.position]))
  const openStages = stages.filter((s) => s.kind === 'OPEN')
  const reached = new Map(openStages.map((s) => [s.id, 0]))
  let won = 0
  for (const deal of deals) {
    // Highest open stage reached: current, or any "to" of its stage changes.
    // Every deal starts in the first open stage.
    let highest = Math.max(deal.stage.kind === 'OPEN' ? deal.stage.position : -1, openStages[0]?.position ?? -1)
    for (const event of deal.events) {
      const to = (event.properties as { to?: string }).to
      const toPosition = to ? position.get(to) : undefined
      if (toPosition !== undefined && openStages.some((s) => s.position === toPosition)) highest = Math.max(highest, toPosition)
    }
    if (deal.stage.kind === 'WON') {
      won++
      highest = Math.max(highest, openStages.at(-1)?.position ?? highest)
    }
    for (const stage of openStages) if (stage.position <= highest || deal.stage.kind === 'WON') reached.set(stage.id, reached.get(stage.id)! + 1)
  }
  const rows = openStages.map((s) => ({ stage: s.name, count: reached.get(s.id)! }))
  rows.push({ stage: 'Won', count: won })
  return { total: deals.length, rows }
}

/** Deals by source channel: volume, wins, win rate, won value. */
export async function channels(p: Period, projectId?: string) {
  const deals = await prisma.deal.findMany({
    where: { deletedAt: null, createdAt: { gte: p.from }, ...(projectId ? { product: { projectId } } : {}) },
    select: { source: true, amount: true, stage: { select: { kind: true } } },
  })
  const by = new Map<string, { deals: number; won: number; lost: number; wonValue: number }>()
  for (const d of deals) {
    const key = d.source ? CHANNEL_LABELS[d.source] : 'Not set'
    const row = by.get(key) ?? { deals: 0, won: 0, lost: 0, wonValue: 0 }
    row.deals++
    if (d.stage.kind === 'WON') {
      row.won++
      row.wonValue += Number(d.amount ?? 0)
    }
    if (d.stage.kind === 'LOST') row.lost++
    by.set(key, row)
  }
  return [...by.entries()].map(([channel, r]) => ({ channel, ...r, winRate: r.won + r.lost ? r.won / (r.won + r.lost) : null })).sort((a, b) => b.deals - a.deals)
}

/** Touches per week (last 12 weeks) and by type over the period, with the email reply rate. */
export async function activity(p: Period) {
  const weeks = 12
  const since = new Date(p.to.getTime() - weeks * 7 * DAY)
  const items = await prisma.activity.findMany({ where: { occurredAt: { gte: since, lte: p.to } }, select: { occurredAt: true, type: true, direction: true } })
  const perWeek = Array.from({ length: weeks }, (_, i) => {
    const start = new Date(since.getTime() + i * 7 * DAY)
    return { start, outbound: 0, inbound: 0 }
  })
  const byType = new Map<string, { outbound: number; inbound: number }>()
  for (const a of items) {
    const index = Math.min(weeks - 1, Math.floor((a.occurredAt.getTime() - since.getTime()) / (7 * DAY)))
    const inbound = a.direction === 'INBOUND'
    perWeek[index][inbound ? 'inbound' : 'outbound']++
    if (a.occurredAt >= p.from) {
      const row = byType.get(a.type) ?? { outbound: 0, inbound: 0 }
      row[inbound ? 'inbound' : 'outbound']++
      byType.set(a.type, row)
    }
  }
  const emails = byType.get('EMAIL')
  return {
    perWeek,
    byType: [...byType.entries()].map(([type, r]) => ({ type, ...r })).sort((a, b) => b.outbound + b.inbound - (a.outbound + a.inbound)),
    emailReplyRate: emails?.outbound ? emails.inbound / emails.outbound : null,
  }
}
