import 'server-only'
import { z } from 'zod'
import { prisma, runInWorkspace } from '@/lib/prisma'
import { managesSeller } from '@/lib/workspaces/roles'
import { teamOf, type Tried } from '@/lib/workspaces/team'
import { isKnownCurrency, parsePercent } from './amounts'
import { QuoteRefusal } from './refusal'

const LONGEST_FIELD = 300
const LONGEST_ADDRESS = 1000
const LONGEST_TERMS = 20_000
const MOST_VALIDITY_DAYS = 3650

const NOT_ALLOWED = 'Only owners and admins can change the seller details.'

const text = (longest: number) => z.string().trim().max(longest).transform((value) => value || null)

const sellerFields = z.object({
  legalName: text(LONGEST_FIELD),
  address: text(LONGEST_ADDRESS),
  companyNumber: text(LONGEST_FIELD),
  vatNumber: text(LONGEST_FIELD),
  contactEmail: z.union([z.literal('').transform(() => null), z.string().trim().email('The contact email is not a valid address.')]),
  defaultCurrency: z.string().trim().toUpperCase().refine(isKnownCurrency, "The default currency isn't a currency code: use three letters, like EUR."),
  defaultTaxRate: z.string().trim().transform((rate) => parsePercent(rate || '0')),
  defaultValidityDays: z.coerce.number().int('The validity is a whole number of days.').min(1, 'The validity is at least one day.').max(MOST_VALIDITY_DAYS, `The validity is at most ${MOST_VALIDITY_DAYS} days.`),
  defaultTerms: text(LONGEST_TERMS),
  yearlyQuoteNumbers: z.boolean(),
})

export type SellerInput = z.input<typeof sellerFields>

function readSeller(input: SellerInput) {
  const parsed = sellerFields.safeParse(input)
  if (!parsed.success) throw new QuoteRefusal(parsed.error.issues[0].message)
  const { defaultTaxRate, ...fields } = parsed.data
  return { ...fields, defaultTaxRateMilliPercent: defaultTaxRate }
}

/**
 * Saves what a workspace's quotes say about it, for an owner or an admin. On the screen only: no tool
 * reaches this, since what's written in records can carry instructions and this goes out in the company's name.
 */
export async function saveSellerDetails(workspaceId: string, actorId: string, input: SellerInput): Promise<Tried> {
  const actor = (await teamOf(workspaceId)).find(({ userId }) => userId === actorId)
  if (!managesSeller(actor?.role)) return { ok: false, error: NOT_ALLOWED }
  try {
    const data = readSeller(input)
    await runInWorkspace(workspaceId, () => prisma.sellerDetails.upsert({ where: { workspaceId }, create: { workspaceId, ...data }, update: data }))
    return { ok: true }
  } catch (error) {
    if (error instanceof QuoteRefusal) return { ok: false, error: error.message }
    throw error
  }
}
