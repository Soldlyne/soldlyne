'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireActor } from '@/lib/actor'
import { mailboxesChanged } from './workspaces'

const mailboxFields = z.object({
  displayName: z.string().trim().min(1).optional(),
  active: z.boolean().optional(),
  syncContacts: z.boolean().optional(),
})

export async function updateMailbox(id: string, input: z.input<typeof mailboxFields>) {
  await requireActor()
  await prisma.mailbox.update({ where: { id }, data: mailboxFields.parse(input) })
  revalidatePath('/', 'layout')
}

export async function deleteMailbox(id: string) {
  await requireActor()
  await prisma.mailbox.delete({ where: { id } })
  mailboxesChanged()
  revalidatePath('/', 'layout')
}
