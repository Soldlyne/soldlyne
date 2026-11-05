'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { currentWorkspaceId, prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { normalizeDomain, normalizeEmail, parseMoney } from './format'
import type { ImportTarget } from './import-targets'

/**
 * CSV import. Each row can create or update a company, a person and a deal.
 * Companies are matched by domain then name, people by email then LinkedIn
 * URL, so importing the same file twice updates instead of duplicating.
 */


const input = z.object({
  rows: z.array(z.record(z.string(), z.string())).max(5000),
  /** CSV column -> target ('' = ignored). Custom targets store the column under its own key. */
  mapping: z.record(z.string(), z.string()),
  productId: z.string().nullable(),
  source: z.enum(['PHONE', 'EMAIL', 'LINKEDIN', 'SOCIAL', 'INBOUND', 'REFERRAL', 'EVENT', 'OTHER']).nullable(),
})

function customKey(column: string) {
  return column.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'field'
}

export async function importRows(raw: z.input<typeof input>) {
  if (!(await getSession())) throw new Error('Not signed in')
  const { rows, mapping, productId, source } = input.parse(raw)
  const workspaceId = await currentWorkspaceId()
  const stages = await prisma.stage.findMany({ orderBy: { position: 'asc' } })
  const result = { companies: 0, people: 0, deals: 0, skipped: 0 }

  // Custom fields for columns mapped to custom targets.
  for (const [column, target] of Object.entries(mapping)) {
    if (target !== 'company.custom' && target !== 'person.custom') continue
    const object = target === 'company.custom' ? 'COMPANY' : 'PERSON'
    const key = customKey(column)
    await prisma.customField.upsert({
      where: { workspaceId_object_key: { workspaceId, object, key } },
      create: { workspaceId, object, key, label: column.trim(), type: /url|link/i.test(column) ? 'URL' : 'TEXT', position: Date.now() / 1e12 },
      update: {},
    })
  }

  for (const row of rows) {
    const get = (target: ImportTarget) => {
      const column = Object.keys(mapping).find((c) => mapping[c] === target)
      return column ? (row[column] ?? '').trim() : ''
    }
    const custom = (target: 'company.custom' | 'person.custom') =>
      Object.fromEntries(
        Object.entries(mapping)
          .filter(([column, t]) => t === target && row[column]?.trim())
          .map(([column]) => [customKey(column), row[column].trim()]),
      )

    // Company
    let companyId: string | null = null
    const companyName = get('company.name')
    const domain = normalizeDomain(get('company.domain'))
    if (companyName || domain) {
      const existing =
        (domain && (await prisma.company.findFirst({ where: { domain } }))) ||
        (companyName && (await prisma.company.findFirst({ where: { name: { equals: companyName, mode: 'insensitive' } } }))) ||
        null
      const fields = {
        industry: get('company.industry') || undefined,
        size: get('company.size') || undefined,
        city: get('company.city') || undefined,
        country: get('company.country') || undefined,
        linkedinUrl: get('company.linkedinUrl') || undefined,
        priority: get('company.priority') || undefined,
        description: get('company.description') || undefined,
      }
      if (existing) {
        await prisma.company.update({
          where: { id: existing.id },
          data: {
            ...fields,
            domain: existing.domain ?? domain,
            deletedAt: null,
            custom: { ...((existing.custom as object) ?? {}), ...custom('company.custom') },
          },
        })
        companyId = existing.id
      } else {
        const company = await prisma.company.create({
          data: { name: companyName || domain!, domain, ...fields, source, createdBy: 'IMPORT', custom: custom('company.custom') },
        })
        await prisma.timelineEvent.create({ data: { name: 'company.created', actor: 'IMPORT', companyId: company.id } })
        companyId = company.id
        result.companies++
      }
    }

    // Person
    let personId: string | null = null
    const email = get('person.email') ? normalizeEmail(get('person.email')) : ''
    const linkedinUrl = get('person.linkedinUrl')
    let firstName = get('person.firstName')
    let lastName = get('person.lastName')
    const fullName = get('person.fullName')
    if (fullName && !firstName && !lastName) {
      const [first, ...rest] = fullName.split(/\s+/)
      firstName = first
      lastName = rest.join(' ')
    }
    if (email || linkedinUrl || firstName || lastName) {
      const existing =
        (email && (await prisma.person.findFirst({ where: { emails: { has: email } } }))) ||
        (linkedinUrl && (await prisma.person.findFirst({ where: { linkedinUrl } }))) ||
        null
      const phone = get('person.phone')
      const fields = { jobTitle: get('person.jobTitle') || undefined, linkedinUrl: linkedinUrl || undefined }
      if (existing) {
        await prisma.person.update({
          where: { id: existing.id },
          data: {
            ...fields,
            firstName: existing.firstName || firstName,
            lastName: existing.lastName || lastName,
            emails: email && !existing.emails.includes(email) ? [...existing.emails, email] : undefined,
            phones: phone && !existing.phones.includes(phone) ? [...existing.phones, phone] : undefined,
            companyId: existing.companyId ?? companyId,
            deletedAt: null,
            custom: { ...((existing.custom as object) ?? {}), ...custom('person.custom') },
          },
        })
        personId = existing.id
      } else {
        const person = await prisma.person.create({
          data: {
            firstName,
            lastName,
            emails: email ? [email] : [],
            phones: phone ? [phone] : [],
            ...fields,
            companyId,
            source,
            createdBy: 'IMPORT',
            custom: custom('person.custom'),
          },
        })
        await prisma.timelineEvent.create({ data: { name: 'person.created', actor: 'IMPORT', personId: person.id, companyId } })
        personId = person.id
        result.people++
      }
    }

    // Deal
    if (productId && (companyId || personId || get('deal.name'))) {
      const stageName = get('deal.stage').toLowerCase()
      const stage = stages.find((s) => s.name.toLowerCase() === stageName) ?? stages[0]
      const name = get('deal.name') || companyName || [firstName, lastName].filter(Boolean).join(' ') || 'Imported deal'
      const duplicate = await prisma.deal.findFirst({ where: { productId, deletedAt: null, companyId, name } })
      if (!duplicate) {
        let amount: bigint | null = null
        try {
          amount = get('deal.amount') ? parseMoney(get('deal.amount')) : null
        } catch {}
        const deal = await prisma.deal.create({
          data: { name, productId, stageId: stage.id, companyId, contactId: personId, amount, source, createdBy: 'IMPORT', position: -Date.now() / 1e6 },
        })
        await prisma.timelineEvent.create({ data: { name: 'deal.created', actor: 'IMPORT', dealId: deal.id, companyId } })
        result.deals++
      }
    }
    if (!companyId && !personId) result.skipped++
  }

  revalidatePath('/', 'layout')
  return result
}
