import 'server-only'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

const live = { deletedAt: null }

/** Products with a display label: "Project · Product" unless both names match. */
export async function listProducts({ includeArchived = false } = {}) {
  const products = await prisma.product.findMany({
    where: includeArchived ? {} : { archived: false, OR: [{ projectId: null }, { project: { archived: false } }] },
    orderBy: [{ project: { position: 'asc' } }, { position: 'asc' }],
    include: { project: { select: { id: true, name: true, color: true } } },
  })
  return products.map((product) => ({ ...product, label: productLabel(product) }))
}

export function productLabel(product: { name: string; project?: { name: string } | null }) {
  return product.project && product.project.name !== product.name ? `${product.project.name} · ${product.name}` : product.name
}

export async function listProjects({ includeArchived = false } = {}) {
  return prisma.project.findMany({
    where: includeArchived ? {} : { archived: false },
    orderBy: { position: 'asc' },
    include: { entity: true, products: { where: includeArchived ? {} : { archived: false }, orderBy: { position: 'asc' } } },
  })
}

export async function listStages() {
  return prisma.stage.findMany({ orderBy: { position: 'asc' } })
}

export async function openTaskCount() {
  return prisma.task.count({ where: { completedAt: null, dueAt: { lte: endOfToday() } } })
}

export function endOfToday() {
  const d = new Date()
  d.setHours(23, 59, 59, 999)
  return d
}

function contains(q: string) {
  return { contains: q, mode: 'insensitive' as const }
}

export async function listCompanies(where: Prisma.CompanyWhereInput = { ...live }) {
  return prisma.company.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: {
      _count: { select: { people: { where: live }, deals: { where: live } } },
      activities: { orderBy: { occurredAt: 'desc' }, take: 1, select: { occurredAt: true, type: true } },
      tasks: { where: { completedAt: null }, orderBy: { dueAt: { sort: 'asc', nulls: 'last' } }, take: 1, select: { title: true, dueAt: true } },
    },
  })
}

export async function listPeople(where: Prisma.PersonWhereInput = { ...live }) {
  return prisma.person.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: {
      company: { select: { id: true, name: true } },
      participants: { orderBy: { activity: { occurredAt: 'desc' } }, take: 1, select: { activity: { select: { occurredAt: true, type: true } } } },
    },
  })
}

export async function listDeals(filter: { q?: string; productId?: string; projectId?: string; open?: boolean; where?: Prisma.DealWhereInput } = {}) {
  const where: Prisma.DealWhereInput = { ...live, ...(filter.where ? { AND: [filter.where] } : {}) }
  if (filter.productId) where.productId = filter.productId
  if (filter.projectId) where.product = { projectId: filter.projectId }
  if (filter.open) where.stage = { kind: 'OPEN' }
  if (filter.q) where.OR = [{ name: contains(filter.q) }, { company: { name: contains(filter.q) } }]
  return prisma.deal.findMany({
    where,
    orderBy: [{ stage: { position: 'asc' } }, { position: 'asc' }],
    include: {
      product: { include: { project: { select: { id: true, name: true } } } },
      stage: true,
      company: { select: { id: true, name: true, domain: true } },
      contact: { select: { id: true, firstName: true, lastName: true, emails: true } },
      tasks: { where: { completedAt: null }, orderBy: { dueAt: { sort: 'asc', nulls: 'last' } }, take: 1, select: { id: true, title: true, dueAt: true } },
      activities: { orderBy: { occurredAt: 'desc' }, take: 1, select: { occurredAt: true, type: true } },
    },
  })
}
export type DealRow = Awaited<ReturnType<typeof listDeals>>[number]

const timelineInclude = {
  participants: { include: { person: { select: { id: true, firstName: true, lastName: true, emails: true } } } },
  deal: { select: { id: true, name: true } },
  company: { select: { id: true, name: true } },
} satisfies Prisma.ActivityInclude

/** Activities, notes and system events of a record, newest first. */
export async function timelineFor(target: { companyId?: string; personId?: string; dealId?: string }) {
  const activityWhere: Prisma.ActivityWhereInput = target.personId
    ? { participants: { some: { personId: target.personId } } }
    : target.dealId
      ? { dealId: target.dealId }
      : { companyId: target.companyId }
  const [activities, notes, events] = await Promise.all([
    prisma.activity.findMany({ where: activityWhere, orderBy: { occurredAt: 'desc' }, take: 200, include: timelineInclude }),
    prisma.note.findMany({ where: target, orderBy: { createdAt: 'desc' } }),
    prisma.timelineEvent.findMany({ where: target, orderBy: { happenedAt: 'desc' }, take: 200 }),
  ])
  type Entry =
    | { kind: 'activity'; at: Date; activity: (typeof activities)[number] }
    | { kind: 'note'; at: Date; note: (typeof notes)[number] }
    | { kind: 'event'; at: Date; event: (typeof events)[number] }
  const entries: Entry[] = [
    ...activities.map((activity) => ({ kind: 'activity' as const, at: activity.occurredAt, activity })),
    ...notes.map((note) => ({ kind: 'note' as const, at: note.createdAt, note })),
    ...events.map((event) => ({ kind: 'event' as const, at: event.happenedAt, event })),
  ]
  return entries.sort((a, b) => b.at.getTime() - a.at.getTime())
}
export type TimelineEntry = Awaited<ReturnType<typeof timelineFor>>[number]

export async function tasksFor(target: { companyId?: string; personId?: string; dealId?: string }) {
  return prisma.task.findMany({
    where: target,
    orderBy: [{ completedAt: { sort: 'desc', nulls: 'first' } }, { dueAt: { sort: 'asc', nulls: 'last' } }],
    include: taskInclude,
  })
}

export const taskInclude = {
  deal: { select: { id: true, name: true } },
  company: { select: { id: true, name: true } },
  person: { select: { id: true, firstName: true, lastName: true, emails: true } },
} satisfies Prisma.TaskInclude
export type TaskRow = Prisma.TaskGetPayload<{ include: typeof taskInclude }>

/** Small option lists for pickers (company, person, deal). */
export async function pickerOptions() {
  const [companies, people, deals] = await Promise.all([
    prisma.company.findMany({ where: live, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.person.findMany({
      where: live,
      select: { id: true, firstName: true, lastName: true, emails: true, companyId: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    }),
    prisma.deal.findMany({ where: { ...live, stage: { kind: 'OPEN' } }, select: { id: true, name: true, companyId: true }, orderBy: { updatedAt: 'desc' } }),
  ])
  return { companies, people, deals }
}
export type PickerOptions = Awaited<ReturnType<typeof pickerOptions>>
