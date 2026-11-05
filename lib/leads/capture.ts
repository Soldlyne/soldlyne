import 'server-only'
import { z } from 'zod'
import { sha256 } from '@/lib/hash'
import { prisma } from '@/lib/prisma'
import { normalizeDomain, normalizeEmail } from '@/lib/crm/format'

/** Free-mail providers: their domain says nothing about the company. */
const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.fr', 'hotmail.com', 'hotmail.fr', 'outlook.com', 'outlook.fr', 'live.com', 'live.fr', 'msn.com',
  'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'gmx.fr', 'orange.fr', 'wanadoo.fr', 'free.fr', 'sfr.fr',
  'laposte.net', 'bbox.fr', 'neuf.fr', 'yandex.com', 'zoho.com',
])

export const hashKey = sha256

export const leadSchema = z.object({
  email: z.string().trim().email().transform(normalizeEmail),
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  name: z.string().trim().max(200).optional(),
  company: z.string().trim().max(200).optional(),
  jobTitle: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(50).optional(),
  linkedinUrl: z.string().trim().url().max(300).optional(),
  message: z.string().trim().max(5000).optional(),
  /** Explicit opt-in to receive emails (checkbox ticked). */
  consent: z.boolean().default(false),
  /** Where on the site: page URL or form name. */
  page: z.string().trim().max(500).optional(),
  custom: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
})
export type LeadInput = z.input<typeof leadSchema>

export async function captureLead(sourceId: string, input: LeadInput) {
  const source = await prisma.leadSource.findUniqueOrThrow({ where: { id: sourceId } })
  const lead = leadSchema.parse(input)
  const domain = normalizeDomain(lead.email)!
  let [firstName, lastName] = [lead.firstName ?? '', lead.lastName ?? '']
  if (!firstName && !lastName && lead.name) {
    const [first, ...rest] = lead.name.split(/\s+/)
    firstName = first
    lastName = rest.join(' ')
  }

  // Company: by work-email domain, else by the name typed in the form.
  let companyId: string | null = null
  if (!FREE_MAIL.has(domain)) {
    const company =
      (await prisma.company.findFirst({ where: { domain } })) ??
      (await prisma.company.create({ data: { name: lead.company || domain, domain, source: 'INBOUND', createdBy: 'IMPORT' } }))
    if (company.deletedAt) await prisma.company.update({ where: { id: company.id }, data: { deletedAt: null } })
    companyId = company.id
  } else if (lead.company) {
    const company =
      (await prisma.company.findFirst({ where: { name: { equals: lead.company, mode: 'insensitive' }, deletedAt: null } })) ??
      (await prisma.company.create({ data: { name: lead.company, source: 'INBOUND', createdBy: 'IMPORT' } }))
    companyId = company.id
  }

  const now = new Date()
  const consent = lead.consent ? { consentAt: now, consentSource: `${source.name}${lead.page ? ` (${lead.page})` : ''}` } : {}
  const existing = await prisma.person.findFirst({ where: { emails: { has: lead.email } } })
  const person = existing
    ? await prisma.person.update({
        where: { id: existing.id },
        data: {
          firstName: existing.firstName || firstName,
          lastName: existing.lastName || lastName,
          jobTitle: existing.jobTitle ?? lead.jobTitle,
          linkedinUrl: existing.linkedinUrl ?? lead.linkedinUrl,
          phones: lead.phone && !existing.phones.includes(lead.phone) ? [...existing.phones, lead.phone] : undefined,
          companyId: existing.companyId ?? companyId,
          deletedAt: null,
          custom: lead.custom ? { ...((existing.custom as object) ?? {}), ...lead.custom } : undefined,
          ...consent,
        },
      })
    : await prisma.person.create({
        data: {
          firstName,
          lastName,
          emails: [lead.email],
          phones: lead.phone ? [lead.phone] : [],
          jobTitle: lead.jobTitle,
          linkedinUrl: lead.linkedinUrl,
          companyId,
          source: 'INBOUND',
          createdBy: 'IMPORT',
          custom: lead.custom ?? {},
          ...consent,
        },
      })
  if (!existing) await prisma.timelineEvent.create({ data: { name: 'person.created', actor: 'IMPORT', personId: person.id, companyId: person.companyId, properties: { source: source.name } } })

  // Deal for the product, unless one is already open for this person or company.
  let dealId: string | null = null
  if (source.productId) {
    const open = await prisma.deal.findFirst({
      where: { productId: source.productId, deletedAt: null, stage: { kind: 'OPEN' }, OR: [{ contactId: person.id }, ...(person.companyId ? [{ companyId: person.companyId }] : [])] },
    })
    if (open) dealId = open.id
    else {
      const stage = await prisma.stage.findFirstOrThrow({ orderBy: { position: 'asc' } })
      const deal = await prisma.deal.create({
        data: {
          name: lead.company || (person.companyId ? (await prisma.company.findUnique({ where: { id: person.companyId } }))!.name : `${firstName} ${lastName}`.trim() || lead.email),
          productId: source.productId,
          stageId: stage.id,
          companyId: person.companyId,
          contactId: person.id,
          source: 'INBOUND',
          createdBy: 'IMPORT',
          position: -now.getTime() / 1e6,
        },
      })
      await prisma.timelineEvent.create({ data: { name: 'deal.created', actor: 'IMPORT', dealId: deal.id, companyId: deal.companyId, properties: { source: source.name } } })
      dealId = deal.id
    }
  }

  await prisma.activity.create({
    data: {
      type: 'OTHER',
      direction: 'INBOUND',
      occurredAt: now,
      subject: `Form: ${source.name}`,
      body: [lead.message, lead.page ? `Page: ${lead.page}` : null, lead.consent ? 'Opted in to emails' : null].filter(Boolean).join('\n\n') || null,
      source: 'IMPORT',
      companyId: person.companyId,
      dealId,
      createdBy: 'IMPORT',
      participants: { create: [{ personId: person.id, role: 'FROM', handle: lead.email }] },
    },
  })
  if (source.createTask) {
    await prisma.task.create({
      data: { title: `New lead from ${source.name}: ${`${firstName} ${lastName}`.trim() || lead.email}`, body: lead.message, dueAt: now, personId: person.id, companyId: person.companyId, dealId, createdBy: 'IMPORT' },
    })
  }
  await prisma.leadSource.update({ where: { id: source.id }, data: { leadCount: { increment: 1 }, lastLeadAt: now } })
  return { personId: person.id, dealId, created: !existing }
}
