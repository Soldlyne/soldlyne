'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireActor } from '@/lib/actor'
import { recordEvent } from '@/lib/crm/timeline'

const TYPES = ['ACCOUNTANT', 'MSP', 'LAWYER', 'INSURER', 'CONSULTANT', 'INVESTOR', 'OTHER'] as const

const fields = z.object({
  name: z.string().trim().min(1).optional(),
  type: z.enum(TYPES).optional(),
  status: z.enum(['PROSPECT', 'ACTIVE', 'INACTIVE']).optional(),
  companyId: z.string().nullable().optional(),
  contactId: z.string().nullable().optional(),
  commissionPct: z.number().int().min(0).max(100).optional(),
  notes: z
    .string()
    .trim()
    .transform((v) => v || null)
    .nullable()
    .optional(),
})

export async function createPartner(input: z.input<typeof fields> & { name: string }) {
  await requireActor()
  const partner = await prisma.partner.create({ data: { ...fields.parse(input), name: input.name.trim() } })
  revalidatePath('/', 'layout')
  return { id: partner.id }
}

export async function updatePartner(id: string, input: z.input<typeof fields>) {
  await requireActor()
  await prisma.partner.update({ where: { id }, data: fields.parse(input) })
  revalidatePath('/', 'layout')
}

export async function deletePartner(id: string) {
  await requireActor()
  await prisma.partner.delete({ where: { id } })
  revalidatePath('/', 'layout')
}

/** Who referred the deal; a referred deal's source becomes Referral. */
export async function setDealPartner(dealId: string, partnerId: string | null) {
  await requireActor()
  const deal = await prisma.deal.update({ where: { id: dealId }, data: { partnerId, ...(partnerId ? { source: 'REFERRAL' as const } : {}) }, include: { partner: true } })
  await recordEvent('deal.updated', { dealId, companyId: deal.companyId }, { diff: { partner: { before: null, after: deal.partner?.name ?? null } } })
  revalidatePath('/', 'layout')
}

export async function setCommissionPaid(dealId: string, paid: boolean) {
  await requireActor()
  await prisma.deal.update({ where: { id: dealId }, data: { commissionPaidAt: paid ? new Date() : null } })
  revalidatePath('/', 'layout')
}
