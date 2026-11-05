'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { currentWorkspaceId, prisma } from '@/lib/prisma'
import { requireActor, currentActor } from '@/lib/actor'
import { topPosition } from './deal-stage'
import { diffOf, recordEvent, recordUpdate } from './timeline'
import { normalizeDomain, normalizeEmail, parseMoney } from './format'

async function guard() {
  await requireActor()
}

function done() {
  revalidatePath('/', 'layout')
}

const optionalText = z
  .string()
  .trim()
  .transform((value) => value || null)
  .nullable()
  .optional()
const channel = z.enum(['PHONE', 'EMAIL', 'LINKEDIN', 'SOCIAL', 'INBOUND', 'REFERRAL', 'EVENT', 'OTHER']).nullable().optional()
const customPatch = z.record(z.string(), z.unknown()).optional()

function mergeCustom(current: Prisma.JsonValue, patch: Record<string, unknown> | undefined): Prisma.InputJsonValue | undefined {
  if (!patch) return undefined
  const merged: Record<string, unknown> = { ...((current as Record<string, unknown>) ?? {}) }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === '' || value === undefined) delete merged[key]
    else merged[key] = value
  }
  return merged as Prisma.InputJsonValue
}

// ---------------------------------------------------------------------------
// Companies
// ---------------------------------------------------------------------------

const companyFields = z.object({
  name: z.string().trim().min(1).optional(),
  domain: optionalText.transform((value) => normalizeDomain(value)),
  linkedinUrl: optionalText,
  industry: optionalText,
  size: optionalText,
  city: optionalText,
  country: optionalText,
  description: optionalText,
  priority: optionalText,
  source: channel,
  custom: customPatch,
})

export async function createCompany(input: { name: string; domain?: string | null }) {
  await guard()
  const data = companyFields.parse(input)
  // A deleted company with the same domain comes back instead of a duplicate.
  const existing = data.domain ? await prisma.company.findFirst({ where: { domain: data.domain } }) : null
  if (existing) {
    if (existing.deletedAt) {
      await prisma.company.update({ where: { id: existing.id }, data: { deletedAt: null } })
      await recordEvent('company.restored', { companyId: existing.id })
    }
    done()
    return { id: existing.id }
  }
  const company = await prisma.company.create({ data: { name: data.name ?? data.domain ?? 'Untitled', domain: data.domain, createdBy: currentActor() } })
  await recordEvent('company.created', { companyId: company.id })
  done()
  return { id: company.id }
}

export async function updateCompany(id: string, input: z.input<typeof companyFields>) {
  await guard()
  const { custom, ...patch } = companyFields.parse(input)
  const before = await prisma.company.findUniqueOrThrow({ where: { id } })
  if (patch.domain && patch.domain !== before.domain) {
    const taken = await prisma.company.findFirst({ where: { domain: patch.domain } })
    if (taken) throw new Error(`${patch.domain} already belongs to ${taken.name}`)
  }
  const data = { ...patch, custom: mergeCustom(before.custom, custom) }
  await prisma.company.update({ where: { id }, data })
  await recordUpdate('company', { companyId: id }, diffOf(before as Record<string, unknown>, data as Record<string, unknown>))
  done()
}

export async function deleteCompany(id: string) {
  await guard()
  await prisma.company.update({ where: { id }, data: { deletedAt: new Date() } })
  await recordEvent('company.deleted', { companyId: id })
  done()
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

const personFields = z.object({
  firstName: z.string().trim().optional(),
  lastName: z.string().trim().optional(),
  emails: z.array(z.string().trim().email().transform(normalizeEmail)).optional(),
  phones: z.array(z.string().trim().min(1)).optional(),
  jobTitle: optionalText,
  linkedinUrl: optionalText,
  city: optionalText,
  companyId: z.string().nullable().optional(),
  source: channel,
  consentAt: z.coerce.date().nullable().optional(),
  consentSource: optionalText,
  custom: customPatch,
})

export async function createPerson(input: { firstName?: string; lastName?: string; email?: string; companyId?: string | null; jobTitle?: string; linkedinUrl?: string }) {
  await guard()
  const email = input.email ? normalizeEmail(input.email) : null
  if (email) {
    const existing = await prisma.person.findFirst({ where: { emails: { has: email } } })
    if (existing) {
      if (existing.deletedAt) {
        await prisma.person.update({ where: { id: existing.id }, data: { deletedAt: null } })
        await recordEvent('person.restored', { personId: existing.id })
      }
      done()
      return { id: existing.id }
    }
  }
  const data = personFields.parse({ ...input, emails: email ? [email] : [] })
  if (data.linkedinUrl && (await prisma.person.findFirst({ where: { linkedinUrl: data.linkedinUrl } }))) {
    throw new Error('This LinkedIn profile is already in Soldlyne')
  }
  // Without an explicit company, a work address links the person to the company of its domain.
  let companyId = data.companyId ?? null
  if (!companyId && email) {
    const company = await prisma.company.findFirst({ where: { domain: normalizeDomain(email), deletedAt: null } })
    companyId = company?.id ?? null
  }
  const person = await prisma.person.create({
    data: {
      firstName: data.firstName ?? '',
      lastName: data.lastName ?? '',
      emails: data.emails ?? [],
      jobTitle: data.jobTitle,
      linkedinUrl: data.linkedinUrl,
      companyId,
      createdBy: currentActor(),
    },
  })
  await recordEvent('person.created', { personId: person.id, companyId })
  done()
  return { id: person.id }
}

export async function updatePerson(id: string, input: z.input<typeof personFields>) {
  await guard()
  const { custom, ...patch } = personFields.parse(input)
  const before = await prisma.person.findUniqueOrThrow({ where: { id } })
  const data = { ...patch, custom: mergeCustom(before.custom, custom) }
  await prisma.person.update({ where: { id }, data })
  await recordUpdate('person', { personId: id }, diffOf(before as Record<string, unknown>, data as Record<string, unknown>))
  done()
}

export async function deletePerson(id: string) {
  await guard()
  await prisma.person.update({ where: { id }, data: { deletedAt: new Date() } })
  await recordEvent('person.deleted', { personId: id })
  done()
}

// ---------------------------------------------------------------------------
// Deals
// ---------------------------------------------------------------------------

const dealFields = z.object({
  name: z.string().trim().min(1).optional(),
  productId: z.string().optional(),
  stageId: z.string().optional(),
  companyId: z.string().nullable().optional(),
  contactId: z.string().nullable().optional(),
  amount: z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === null ? null : parseMoney(String(value)))),
  currency: z.string().length(3).optional(),
  probability: z.number().int().min(0).max(100).nullable().optional(),
  closeDate: z.coerce.date().nullable().optional(),
  source: channel,
  lostReason: optionalText,
  custom: customPatch,
})

export async function createDeal(input: z.input<typeof dealFields> & { name: string; productId: string }) {
  await guard()
  const data = dealFields.parse(input)
  const stageId = data.stageId ?? (await prisma.stage.findFirstOrThrow({ orderBy: { position: 'asc' } })).id
  let companyId = data.companyId ?? null
  if (!companyId && data.contactId) {
    companyId = (await prisma.person.findUnique({ where: { id: data.contactId } }))?.companyId ?? null
  }
  const deal = await prisma.deal.create({
    data: {
      name: data.name!,
      productId: data.productId!,
      stageId,
      companyId,
      contactId: data.contactId ?? null,
      amount: data.amount ?? null,
      source: data.source,
      closeDate: data.closeDate,
      position: await topPosition(prisma, stageId, data.productId!),
      createdBy: currentActor(),
    },
  })
  await recordEvent('deal.created', { dealId: deal.id, companyId })
  done()
  return { id: deal.id }
}

export async function updateDeal(id: string, input: z.input<typeof dealFields>) {
  await guard()
  const { custom, ...patch } = dealFields.parse(input)
  const before = await prisma.deal.findUniqueOrThrow({ where: { id }, include: { stage: true } })
  const data: Prisma.DealUncheckedUpdateInput = { ...patch, custom: mergeCustom(before.custom, custom) }
  if (patch.stageId && patch.stageId !== before.stageId) {
    const stage = await prisma.stage.findUniqueOrThrow({ where: { id: patch.stageId } })
    Object.assign(data, {
      stageEnteredAt: new Date(),
      closedAt: stage.kind === 'OPEN' ? null : new Date(),
      position: await topPosition(prisma, stage.id, patch.productId ?? before.productId),
    })
    await recordEvent('deal.stage_changed', { dealId: id, companyId: before.companyId }, { from: before.stage.name, to: stage.name })
  }
  await prisma.deal.update({ where: { id }, data })
  // The stage change has its own timeline event.
  const rest: Record<string, unknown> = { ...patch }
  delete rest.stageId
  await recordUpdate('deal', { dealId: id }, diffOf(before as Record<string, unknown>, { ...rest, custom: data.custom } as Record<string, unknown>))
  done()
}

/** Board drag and drop: new stage and a position between its neighbours. */
export async function moveDeal(id: string, stageId: string, position: number) {
  await guard()
  const before = await prisma.deal.findUniqueOrThrow({ where: { id }, include: { stage: true } })
  if (stageId === before.stageId) {
    await prisma.deal.update({ where: { id }, data: { position } })
  } else {
    const stage = await prisma.stage.findUniqueOrThrow({ where: { id: stageId } })
    await prisma.deal.update({
      where: { id },
      data: { stageId, position, stageEnteredAt: new Date(), closedAt: stage.kind === 'OPEN' ? null : new Date() },
    })
    await recordEvent('deal.stage_changed', { dealId: id, companyId: before.companyId }, { from: before.stage.name, to: stage.name })
  }
  done()
}

export async function deleteDeal(id: string) {
  await guard()
  await prisma.deal.update({ where: { id }, data: { deletedAt: new Date() } })
  await recordEvent('deal.deleted', { dealId: id })
  done()
}

// ---------------------------------------------------------------------------
// Activities, tasks, notes
// ---------------------------------------------------------------------------

const activityInput = z.object({
  type: z.enum(['CALL', 'EMAIL', 'LINKEDIN', 'MEETING', 'SOCIAL', 'SMS', 'OTHER']),
  direction: z.enum(['INBOUND', 'OUTBOUND']).nullable().optional(),
  occurredAt: z.coerce.date().optional(),
  subject: optionalText,
  body: optionalText,
  outcome: optionalText,
  companyId: z.string().nullable().optional(),
  dealId: z.string().nullable().optional(),
  personIds: z.array(z.string()).default([]),
  /** Optional follow-up created in the same step. */
  nextTask: z.object({ title: z.string().trim().min(1), dueAt: z.coerce.date().nullable().optional() }).nullable().optional(),
})

export async function logActivity(input: z.input<typeof activityInput>) {
  await guard()
  const data = activityInput.parse(input)
  // Company from the deal, else from the first person with one.
  let companyId = data.companyId ?? null
  if (!companyId && data.dealId) companyId = (await prisma.deal.findUnique({ where: { id: data.dealId } }))?.companyId ?? null
  if (!companyId && data.personIds.length) {
    const person = await prisma.person.findFirst({ where: { id: { in: data.personIds }, companyId: { not: null } } })
    companyId = person?.companyId ?? null
  }
  const activity = await prisma.activity.create({
    data: {
      type: data.type,
      direction: data.direction ?? null,
      occurredAt: data.occurredAt ?? new Date(),
      subject: data.subject,
      body: data.body,
      outcome: data.outcome,
      companyId,
      dealId: data.dealId ?? null,
      manuallyLinked: true,
      source: currentActor() === 'MCP' ? 'MCP' : 'MANUAL',
      createdBy: currentActor(),
      participants: { create: data.personIds.map((personId) => ({ personId, role: data.direction === 'INBOUND' ? 'FROM' : 'TO' })) },
    },
  })
  if (data.nextTask) {
    await prisma.task.create({
      data: {
        title: data.nextTask.title,
        dueAt: data.nextTask.dueAt ?? null,
        dealId: data.dealId ?? null,
        companyId,
        personId: data.personIds[0] ?? null,
        createdBy: currentActor(),
      },
    })
  }
  done()
  return { id: activity.id }
}

export async function deleteActivity(id: string) {
  await guard()
  await prisma.activity.delete({ where: { id } })
  done()
}

const taskInput = z.object({
  title: z.string().trim().min(1),
  body: optionalText,
  dueAt: z.coerce.date().nullable().optional(),
  companyId: z.string().nullable().optional(),
  personId: z.string().nullable().optional(),
  dealId: z.string().nullable().optional(),
})

export async function createTask(input: z.input<typeof taskInput>) {
  await guard()
  const data = taskInput.parse(input)
  let companyId = data.companyId ?? null
  if (!companyId && data.dealId) companyId = (await prisma.deal.findUnique({ where: { id: data.dealId } }))?.companyId ?? null
  if (!companyId && data.personId) companyId = (await prisma.person.findUnique({ where: { id: data.personId } }))?.companyId ?? null
  const task = await prisma.task.create({ data: { ...data, companyId, createdBy: currentActor() } })
  done()
  return { id: task.id }
}

export async function updateTask(id: string, input: Partial<z.input<typeof taskInput>>) {
  await guard()
  await prisma.task.update({ where: { id }, data: taskInput.partial().parse(input) })
  done()
}

export async function setTaskDone(id: string, isDone: boolean) {
  await guard()
  await prisma.task.update({ where: { id }, data: { completedAt: isDone ? new Date() : null } })
  done()
}

export async function deleteTask(id: string) {
  await guard()
  await prisma.task.delete({ where: { id } })
  done()
}

export async function createNote(input: { body: string; companyId?: string | null; personId?: string | null; dealId?: string | null }) {
  await guard()
  const body = input.body.trim()
  if (!body) throw new Error('Empty note')
  await prisma.note.create({ data: { body, companyId: input.companyId ?? null, personId: input.personId ?? null, dealId: input.dealId ?? null, createdBy: currentActor() } })
  done()
}

export async function deleteNote(id: string) {
  await guard()
  await prisma.note.delete({ where: { id } })
  done()
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function saveProduct(input: { id?: string; name: string; color: string; archived?: boolean; projectId?: string | null }) {
  await guard()
  const data = z
    .object({ name: z.string().trim().min(1), color: z.string().regex(/^#[0-9a-f]{6}$/i), archived: z.boolean().optional(), projectId: z.string().nullable().optional() })
    .parse(input)
  if (input.id) await prisma.product.update({ where: { id: input.id }, data })
  else await prisma.product.create({ data: { ...data, position: (await prisma.product.count()) } })
  done()
}

export async function saveStage(input: { id?: string; name: string; kind: 'OPEN' | 'WON' | 'LOST'; probability: number }) {
  await guard()
  const data = z
    .object({ name: z.string().trim().min(1), kind: z.enum(['OPEN', 'WON', 'LOST']), probability: z.number().int().min(0).max(100) })
    .parse(input)
  if (input.id) await prisma.stage.update({ where: { id: input.id }, data })
  else await prisma.stage.create({ data: { ...data, position: (await prisma.stage.aggregate({ _max: { position: true } }))._max.position! + 1 } })
  done()
}

export async function reorderStages(ids: string[]) {
  await guard()
  await prisma.$transaction(async (tx) => {
    for (const [position, id] of ids.entries()) await tx.stage.update({ where: { id }, data: { position } })
  })
  done()
}

export async function deleteStage(id: string) {
  await guard()
  if (await prisma.deal.count({ where: { stageId: id, deletedAt: null } })) throw new Error('Move the deals out of this stage first.')
  await prisma.deal.deleteMany({ where: { stageId: id } })
  await prisma.stage.delete({ where: { id } })
  done()
}

export async function saveCustomField(input: { object: 'COMPANY' | 'PERSON' | 'DEAL'; label: string; type: 'TEXT' | 'NUMBER' | 'DATE' | 'URL' | 'SELECT' | 'MULTI_SELECT' | 'BOOLEAN'; options?: string[] }) {
  await guard()
  const label = input.label.trim()
  if (!label) throw new Error('Name the field')
  const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'field'
  const options = input.options?.length ? input.options.map((value) => ({ value, label: value })) : undefined
  const workspaceId = await currentWorkspaceId()
  await prisma.customField.upsert({
    where: { workspaceId_object_key: { workspaceId, object: input.object, key } },
    create: { workspaceId, object: input.object, key, label, type: input.type, options, position: await prisma.customField.count() },
    update: { label, type: input.type, options },
  })
  done()
}

export async function deleteCustomField(id: string) {
  await guard()
  await prisma.customField.delete({ where: { id } })
  done()
}

const productDetails = z.object({
  name: z.string().trim().min(1).optional(),
  projectId: z.string().nullable().optional(),
  kind: z.enum(['SAAS', 'SERVICE', 'TRAINING', 'RECRUITMENT', 'LICENSE', 'ADS', 'OTHER']).optional(),
  status: z.enum(['LIVE', 'BETA', 'PLANNED']).optional(),
  tagline: optionalText,
  buyer: optionalText,
  pricing: optionalText,
  url: optionalText,
})

export async function updateProduct(id: string, input: z.input<typeof productDetails>) {
  await guard()
  await prisma.product.update({ where: { id }, data: productDetails.parse(input) })
  done()
}

const projectDetails = z.object({
  name: z.string().trim().min(1).optional(),
  entityId: z.string().nullable().optional(),
  tagline: optionalText,
  url: optionalText,
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  archived: z.boolean().optional(),
})

export async function saveProject(id: string | null, input: z.input<typeof projectDetails>) {
  await guard()
  const data = projectDetails.parse(input)
  if (id) await prisma.project.update({ where: { id }, data })
  else await prisma.project.create({ data: { ...data, name: data.name ?? 'New project', position: await prisma.project.count() } })
  done()
}

/** Products page drag and drop: full order of companies, projects and products after a move. */
export async function saveCatalogOrder(input: {
  entities: string[]
  projects: { id: string; entityId: string | null }[]
  products: { id: string; projectId: string | null }[]
}) {
  await guard()
  const data = z
    .object({
      entities: z.array(z.string()),
      projects: z.array(z.object({ id: z.string(), entityId: z.string().nullable() })),
      products: z.array(z.object({ id: z.string(), projectId: z.string().nullable() })),
    })
    .parse(input)
  await prisma.$transaction(async (tx) => {
    for (const [position, id] of data.entities.entries()) await tx.entity.update({ where: { id }, data: { position } })
    for (const [position, { id, entityId }] of data.projects.entries()) await tx.project.update({ where: { id }, data: { entityId, position } })
    for (const [position, { id, projectId }] of data.products.entries()) await tx.product.update({ where: { id }, data: { projectId, position } })
  })
  done()
}

const entityFields = z.object({
  name: z.string().trim().min(1).optional(),
  siren: optionalText,
  vatNumber: optionalText,
  email: optionalText,
  website: optionalText,
})

export async function saveEntity(id: string | null, input: z.input<typeof entityFields>) {
  await guard()
  const data = entityFields.parse(input)
  if (id) await prisma.entity.update({ where: { id }, data })
  else await prisma.entity.create({ data: { ...data, name: data.name ?? 'New company', position: await prisma.entity.count() } })
  done()
}
