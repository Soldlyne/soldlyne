import 'server-only'
import type { Actor, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { currentActor } from '@/lib/actor'

type Target = { companyId?: string | null; personId?: string | null; dealId?: string | null }
type Diff = Record<string, { before: unknown; after: unknown }>

/** Edits of the same record by the same actor within this window fold into one entry. */
const MERGE_WINDOW_MS = 10 * 60_000

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v)))
}

export function diffOf<T extends Record<string, unknown>>(before: T, patch: Partial<T>): Diff {
  const diff: Diff = {}
  for (const [field, after] of Object.entries(patch)) {
    // Undefined leaves a field untouched, in Prisma as here: it's no change, whatever the field holds.
    if (after === undefined) continue
    const previous = before[field]
    if (JSON.stringify(previous, bigintSafe) !== JSON.stringify(after, bigintSafe)) diff[field] = { before: previous ?? null, after }
  }
  return diff
}

function bigintSafe(_key: string, value: unknown) {
  return typeof value === 'bigint' ? value.toString() : value
}

export async function recordEvent(name: string, target: Target, properties: Record<string, unknown> = {}, actor: Actor = currentActor()) {
  await prisma.timelineEvent.create({ data: { name, properties: json(properties), actor, ...target } })
}

/**
 * "<object>.updated" with a field diff. A new edit within the merge window
 * extends the previous entry: earliest `before`, latest `after`; fields back
 * to their original value drop out.
 */
export async function recordUpdate(object: 'company' | 'person' | 'deal', target: Target, diff: Diff, actor: Actor = currentActor()) {
  if (Object.keys(diff).length === 0) return
  const name = `${object}.updated`
  const recent = await prisma.timelineEvent.findFirst({
    where: { name, actor, ...target, happenedAt: { gte: new Date(Date.now() - MERGE_WINDOW_MS) } },
    orderBy: { happenedAt: 'desc' },
  })
  if (!recent) return recordEvent(name, target, { diff }, actor)
  const merged: Diff = { ...((recent.properties as { diff?: Diff }).diff ?? {}) }
  for (const [field, change] of Object.entries(diff)) {
    merged[field] = { before: merged[field] ? merged[field].before : change.before, after: change.after }
    if (JSON.stringify(merged[field].before) === JSON.stringify(json(merged[field].after))) delete merged[field]
  }
  if (Object.keys(merged).length === 0) {
    await prisma.timelineEvent.delete({ where: { id: recent.id } })
    return
  }
  await prisma.timelineEvent.update({ where: { id: recent.id }, data: { properties: json({ diff: merged }), happenedAt: new Date() } })
}
