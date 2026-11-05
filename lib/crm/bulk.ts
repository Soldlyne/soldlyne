'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireActor } from '@/lib/actor'
import { recordEvent } from './timeline'

async function guard() {
  await requireActor()
}

const ids = z.array(z.string()).min(1).max(1000)

export async function bulkCompanies(input: { ids: string[]; priority?: string | null; delete?: boolean }) {
  await guard()
  const companyIds = ids.parse(input.ids)
  if (input.delete) {
    await prisma.company.updateMany({ where: { id: { in: companyIds } }, data: { deletedAt: new Date() } })
  } else if (input.priority !== undefined) {
    await prisma.company.updateMany({ where: { id: { in: companyIds } }, data: { priority: input.priority || null } })
  }
  revalidatePath('/', 'layout')
}

export async function bulkPeople(input: { ids: string[]; delete?: boolean }) {
  await guard()
  const personIds = ids.parse(input.ids)
  if (input.delete) {
    await prisma.person.updateMany({ where: { id: { in: personIds } }, data: { deletedAt: new Date() } })
  }
  revalidatePath('/', 'layout')
}

export async function bulkDeals(input: { ids: string[]; stageId?: string; delete?: boolean }) {
  await guard()
  const dealIds = ids.parse(input.ids)
  if (input.delete) {
    await prisma.deal.updateMany({ where: { id: { in: dealIds } }, data: { deletedAt: new Date() } })
  } else if (input.stageId) {
    const stage = await prisma.stage.findUniqueOrThrow({ where: { id: input.stageId } })
    const deals = await prisma.deal.findMany({ where: { id: { in: dealIds }, stageId: { not: stage.id } }, include: { stage: true } })
    for (const deal of deals) {
      await prisma.deal.update({
        where: { id: deal.id },
        data: { stageId: stage.id, stageEnteredAt: new Date(), closedAt: stage.kind === 'OPEN' ? null : new Date() },
      })
      await recordEvent('deal.stage_changed', { dealId: deal.id, companyId: deal.companyId }, { from: deal.stage.name, to: stage.name })
    }
  }
  revalidatePath('/', 'layout')
}

const objects = z.enum(['COMPANY', 'PERSON', 'DEAL'])

export async function saveView(object: 'COMPANY' | 'PERSON' | 'DEAL', name: string, query: string) {
  await guard()
  const view = await prisma.view.create({
    data: { object: objects.parse(object), name: z.string().trim().min(1).parse(name), filters: { query }, position: await prisma.view.count({ where: { object } }) },
  })
  revalidatePath('/', 'layout')
  return { id: view.id }
}

export async function deleteView(id: string) {
  await guard()
  await prisma.view.delete({ where: { id } })
  revalidatePath('/', 'layout')
}
