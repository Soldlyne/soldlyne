import 'server-only'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { Actor, Prisma, SellerDetails } from '@prisma/client'
import { currentActor, requireActor } from '@/lib/actor'
import { prisma } from '@/lib/prisma'
import { isKnownCurrency } from './amounts'
import { recordQuoteEvent } from './events'
import { parseLines, type LineInput, type ParsedLine } from './lines'
import { nextQuoteNumber, quoteReference } from './numbering'
import { QuoteRefusal } from './refusal'
import { addDays, daysBetween, readDate, todayUtc } from './status'
import { quoteTotals, storedTaxes } from './totals'

const DEFAULT_CURRENCY = 'EUR'
const DEFAULT_VALIDITY_DAYS = 30
const LONGEST_TEXT = 20_000

const NOT_A_DRAFT = "This quote has been sent, so it can't be edited: make a copy, which is a new quote."
const NOT_FOUND = "This quote doesn't exist."

const optionalText = z.string().trim().max(LONGEST_TEXT).transform((value) => value || null).nullable().optional()
const currency = z.string().trim().toUpperCase().refine(isKnownCurrency, "This isn't a currency code: use three letters, like EUR.")
const date = z.string().trim().transform((text, context) => readDate(text) ?? (context.addIssue({ code: 'custom', message: 'Dates are written yyyy-mm-dd.' }), z.NEVER))

const quoteFields = z.object({
  companyId: z.string().min(1).nullable().optional(),
  contactId: z.string().min(1).nullable().optional(),
  currency: currency.optional(),
  issueDate: date.optional(),
  validUntil: date.optional(),
  notes: optionalText,
  terms: optionalText,
})

export type QuoteInput = z.input<typeof quoteFields> & { lines?: LineInput[] }

function readFields(input: z.input<typeof quoteFields>) {
  const parsed = quoteFields.safeParse(input)
  if (!parsed.success) throw new QuoteRefusal(parsed.error.issues[0].message)
  return parsed.data
}

function checkDates(issueDate: Date, validUntil: Date) {
  if (validUntil < issueDate) throw new QuoteRefusal('The valid-until date is before the issue date.')
}

type Tx = Prisma.TransactionClient

/** Row-level security would refuse these anyway, in a database's words: this says it in a person's. */
async function checkLinks(tx: Tx, { companyId, contactId }: { companyId?: string | null; contactId?: string | null }, lines: ParsedLine[]) {
  if (companyId && !(await tx.company.findFirst({ where: { id: companyId, deletedAt: null }, select: { id: true } }))) throw new QuoteRefusal("This company isn't in this workspace.")
  if (contactId && !(await tx.person.findFirst({ where: { id: contactId, deletedAt: null }, select: { id: true } }))) throw new QuoteRefusal("This contact isn't in this workspace.")
  const productIds = [...new Set(lines.flatMap(({ productId }) => (productId ? [productId] : [])))]
  if ((await tx.product.count({ where: { id: { in: productIds } } })) !== productIds.length) throw new QuoteRefusal("A line's product isn't in this workspace.")
}

/** The rows and amounts a set of lines comes to: the one way a quote's numbers are written. */
function pricedLines(lines: ParsedLine[]) {
  const totals = quoteTotals(lines)
  return {
    rows: lines.map((line, position) => ({ ...line, position, netMinor: totals.lineNets[position] })),
    amounts: { subtotalMinor: totals.subtotalMinor, taxMinor: totals.taxMinor, totalMinor: totals.totalMinor, taxBreakdown: storedTaxes(totals.taxes) },
  }
}

const done = () => revalidatePath('/', 'layout')

type NewDraft = {
  dealId: string | null
  companyId: string | null
  contactId: string | null
  currency: string
  issueDate: Date
  validUntil: Date
  notes: string | null
  terms: string | null
  lines: ParsedLine[]
  copiedFrom?: string
}

/** A new draft under the next number. Everything in the caller's transaction, so a failure anywhere gives the number back. */
async function insertDraft(tx: Tx, draft: NewDraft, seller: Pick<SellerDetails, 'yearlyQuoteNumbers'> | null, actor: Actor) {
  const { lines, copiedFrom, ...fields } = draft
  const { rows, amounts } = pricedLines(lines)
  const number = await nextQuoteNumber(tx)
  const reference = quoteReference(number, seller?.yearlyQuoteNumbers ? todayUtc().getUTCFullYear() : null)
  const quote = await tx.quote.create({ data: { ...fields, ...amounts, number, reference, createdBy: actor, lines: { create: rows } } })
  await recordQuoteEvent(tx, 'quote.created', quote, { reference, ...(copiedFrom ? { copiedFrom } : {}) }, actor)
  return { id: quote.id, reference }
}

/** A draft for a deal, its customer and contact from the deal, its defaults from the seller details. */
export async function createQuote({ dealId, lines = [], ...input }: QuoteInput & { dealId: string }): Promise<{ id: string; reference: string }> {
  await requireActor()
  const fields = readFields(input)
  const actor = currentActor()
  const created = await prisma.$transaction(async (tx) => {
    const deal = await tx.deal.findFirst({ where: { id: dealId, deletedAt: null }, select: { id: true, companyId: true, contactId: true } })
    if (!deal) throw new QuoteRefusal("This deal doesn't exist.")
    const seller = await tx.sellerDetails.findFirst()
    const quoteCurrency = fields.currency ?? seller?.defaultCurrency ?? DEFAULT_CURRENCY
    const parsed = parseLines(lines, quoteCurrency)
    const companyId = fields.companyId === undefined ? deal.companyId : fields.companyId
    const contactId = fields.contactId === undefined ? deal.contactId : fields.contactId
    await checkLinks(tx, { companyId, contactId }, parsed)
    const issueDate = fields.issueDate ?? todayUtc()
    const validUntil = fields.validUntil ?? addDays(issueDate, seller?.defaultValidityDays ?? DEFAULT_VALIDITY_DAYS)
    checkDates(issueDate, validUntil)
    return insertDraft(tx, { dealId: deal.id, companyId, contactId, currency: quoteCurrency, issueDate, validUntil, notes: fields.notes ?? null, terms: fields.terms === undefined ? (seller?.defaultTerms ?? null) : fields.terms, lines: parsed }, seller, actor)
  })
  done()
  return created
}

/** The quote's status, its row locked until the transaction ends: whatever happens next can't cross a concurrent send or answer. */
export async function lockedStatus(tx: Pick<Tx, '$queryRaw'>, id: string): Promise<string> {
  const [row] = await tx.$queryRaw<{ status: string }[]>`SELECT "status" FROM "Quote" WHERE "id" = ${id} FOR UPDATE`
  if (!row) throw new QuoteRefusal(NOT_FOUND)
  return row.status
}

/** Changes a draft. Given lines replace all its lines; a sent quote is refused. */
export async function updateQuote(id: string, { lines, ...input }: QuoteInput): Promise<void> {
  await requireActor()
  const fields = readFields(input)
  await prisma.$transaction(async (tx) => {
    if ((await lockedStatus(tx, id)) !== 'DRAFT') throw new QuoteRefusal(NOT_A_DRAFT)
    const before = await tx.quote.findUniqueOrThrow({ where: { id }, select: { currency: true, issueDate: true, validUntil: true, _count: { select: { lines: true } } } })
    const quoteCurrency = fields.currency ?? before.currency
    // The same minor units mean another amount in another currency: the lines have to be written again for it.
    if (quoteCurrency !== before.currency && !lines && before._count.lines > 0) throw new QuoteRefusal('Give the lines again along with a new currency: their prices are in the old one.')
    const parsed = lines ? parseLines(lines, quoteCurrency) : null
    await checkLinks(tx, fields, parsed ?? [])
    checkDates(fields.issueDate ?? before.issueDate, fields.validUntil ?? before.validUntil)
    const priced = parsed ? pricedLines(parsed) : null
    await tx.quote.update({ where: { id }, data: { ...fields, ...priced?.amounts } })
    if (!priced) return
    await tx.quoteLine.deleteMany({ where: { quoteId: id } })
    await tx.quoteLine.createMany({ data: priced.rows.map((row) => ({ ...row, quoteId: id })) })
  })
  done()
}

/** A new draft with the same content under its own number: how a sent quote changes. Its validity starts today, as long as the original's. */
export async function copyQuote(id: string): Promise<{ id: string; reference: string }> {
  await requireActor()
  const actor = currentActor()
  const copy = await prisma.$transaction(async (tx) => {
    const source = await tx.quote.findUnique({ where: { id }, include: { lines: { orderBy: { position: 'asc' } } } })
    if (!source) throw new QuoteRefusal(NOT_FOUND)
    const seller = await tx.sellerDetails.findFirst({ select: { yearlyQuoteNumbers: true } })
    const issueDate = todayUtc()
    const validUntil = addDays(issueDate, Math.max(daysBetween(source.issueDate, source.validUntil), 0))
    const lines = source.lines.map(({ description, productId, quantityMilli, unitPriceMinor, taxRateMilliPercent, discountMilliPercent }) => ({ description, productId, quantityMilli, unitPriceMinor, taxRateMilliPercent, discountMilliPercent }))
    const { dealId, companyId, contactId, currency: sourceCurrency, notes, terms, reference } = source
    return insertDraft(tx, { dealId, companyId, contactId, currency: sourceCurrency, issueDate, validUntil, notes, terms, lines, copiedFrom: reference }, seller, actor)
  })
  done()
  return copy
}
