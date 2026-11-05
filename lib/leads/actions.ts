'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { hashKey } from './capture'

async function guard() {
  if (!(await getSession())) throw new Error('Not signed in')
}

function newKey() {
  const key = `lead_${randomBytes(24).toString('base64url')}`
  return { key, keyHash: hashKey(key), keyPrefix: key.slice(0, 10) }
}

const fields = z.object({
  name: z.string().trim().min(1).optional(),
  productId: z.string().nullable().optional(),
  createTask: z.boolean().optional(),
})

/** Returns the key once: only its hash is stored. */
export async function createLeadSource(input: z.input<typeof fields> & { name: string }) {
  await guard()
  const { key, ...hashed } = newKey()
  const data = fields.parse(input)
  await prisma.leadSource.create({ data: { name: data.name!, productId: data.productId || null, createTask: data.createTask ?? true, ...hashed } })
  revalidatePath('/lead-sources')
  return { key }
}

export async function updateLeadSource(id: string, input: z.input<typeof fields>) {
  await guard()
  await prisma.leadSource.update({ where: { id }, data: fields.parse(input) })
  revalidatePath('/lead-sources')
}

export async function rotateLeadSourceKey(id: string) {
  await guard()
  const { key, ...hashed } = newKey()
  await prisma.leadSource.update({ where: { id }, data: hashed })
  revalidatePath('/lead-sources')
  return { key }
}

export async function deleteLeadSource(id: string) {
  await guard()
  await prisma.leadSource.delete({ where: { id } })
  revalidatePath('/lead-sources')
}
