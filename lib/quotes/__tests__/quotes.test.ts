import { afterEach, describe, expect, it, vi } from 'vitest'
import { workspaceForFile } from '@/test/fixtures'
import type { QuoteState } from '../status'
import { createDealFixture, fillSeller, TWO_RATES } from './fixtures'

const { prisma } = await import('@/lib/prisma')
const { withMcpActor } = await import('@/lib/actor')
const { copyQuote, createQuote, updateQuote } = await import('../quotes')
const { nextQuoteNumber } = await import('../numbering')
const { listQuotes, quoteStateWhere, readQuote } = await import('../queries')
const { quoteTotals } = await import('../totals')
const { parseLines } = await import('../lines')

const big = (value: number | string) => BigInt(value)

const here = workspaceForFile('quotes')
const elsewhere = workspaceForFile('quotes-elsewhere')
const numbers = workspaceForFile('quotes-numbers')
const yearly = workspaceForFile('quotes-yearly')

const acting = (workspace: typeof here) => <T>(work: () => Promise<T>) => workspace.run(() => withMcpActor('test', work))
const inHere = acting(here)
const inElsewhere = acting(elsewhere)
const inNumbers = acting(numbers)

let tagCount = 0
const nextTag = () => `q${Date.now()}-${tagCount++}`

afterEach(() => vi.useRealTimers())

describe('numbering', () => {
  it('gives each of many concurrent quotes its own number, skipping none', async () => {
    const { deal } = await inNumbers(() => createDealFixture(nextTag()))
    const created = await Promise.all(Array.from({ length: 25 }, () => inNumbers(() => createQuote({ dealId: deal.id }))))
    const taken = created.map(({ reference }) => Number(reference)).sort((a, b) => a - b)
    expect(taken).toEqual(Array.from({ length: 25 }, (_, index) => index + 1))
    expect(new Set(taken).size).toBe(25)
  }, 60_000)

  it('skips nothing when a quote fails after taking its number: the number comes back', async () => {
    const { deal } = await inNumbers(() => createDealFixture(nextTag()))
    const before = (await inNumbers(() => createQuote({ dealId: deal.id }))).reference
    await expect(inNumbers(() => prisma.$transaction(async (tx) => (await nextQuoteNumber(tx), Promise.reject(new Error('failed after the number')))))).rejects.toThrow('failed after the number')
    await expect(inNumbers(() => createQuote({ dealId: deal.id, lines: [{ ...TWO_RATES[0], quantity: 0 }] }))).rejects.toThrow('quantity')
    expect((await inNumbers(() => createQuote({ dealId: deal.id }))).reference).toBe(String(Number(before) + 1).padStart(4, '0'))
  })

  it('counts per workspace', async () => {
    const { deal } = await inHere(() => createDealFixture(nextTag()))
    const first = await inHere(() => createQuote({ dealId: deal.id }))
    const { deal: other } = await inElsewhere(() => createDealFixture(nextTag()))
    const firstElsewhere = await inElsewhere(() => createQuote({ dealId: other.id }))
    expect(firstElsewhere.reference).toBe('0001')
    expect(Number(first.reference)).toBeGreaterThanOrEqual(1)
    expect(await inElsewhere(() => prisma.quote.count({ where: { id: first.id } }))).toBe(0)
  })

  it('prefixes the year when asked, and runs on across years without coming back to a number', async () => {
    const prefixed = acting(yearly)
    const { deal } = await prefixed(() => createDealFixture(nextTag()))
    await prefixed(() => fillSeller({ yearlyQuoteNumbers: true }))
    vi.useFakeTimers({ now: new Date('2026-12-31T12:00:00Z'), toFake: ['Date'] })
    expect((await prefixed(() => createQuote({ dealId: deal.id }))).reference).toBe('2026-0001')
    vi.setSystemTime(new Date('2027-01-01T12:00:00Z'))
    expect((await prefixed(() => createQuote({ dealId: deal.id }))).reference).toBe('2027-0002')
    await prefixed(() => prisma.sellerDetails.updateMany({ data: { yearlyQuoteNumbers: false } }))
    expect((await prefixed(() => createQuote({ dealId: deal.id }))).reference).toBe('0003')
  })
})

describe('a draft', () => {
  it("starts from its deal and the seller's defaults", async () => {
    const tag = nextTag()
    const { deal, company, contact } = await inHere(() => createDealFixture(tag))
    await inHere(() => prisma.sellerDetails.deleteMany())
    await inHere(() => fillSeller({ defaultCurrency: 'USD', defaultValidityDays: 10, defaultTerms: 'Our terms.' }))
    const { id } = await inHere(() => createQuote({ dealId: deal.id }))
    const quote = await inHere(() => prisma.quote.findUniqueOrThrow({ where: { id } }))
    expect(quote).toMatchObject({ status: 'DRAFT', dealId: deal.id, companyId: company.id, contactId: contact.id, currency: 'USD', terms: 'Our terms.', createdBy: 'MCP', tokenHash: null, sellerCopy: null, customerCopy: null })
    expect(quote.validUntil.getTime() - quote.issueDate.getTime()).toBe(10 * 86_400_000)
  })

  it('starts with defaults of its own when the workspace has no seller details', async () => {
    const tag = nextTag()
    const { deal } = await inElsewhere(() => createDealFixture(tag))
    const { id } = await inElsewhere(() => createQuote({ dealId: deal.id }))
    expect(await inElsewhere(() => prisma.quote.findUniqueOrThrow({ where: { id } }))).toMatchObject({ currency: 'EUR', terms: null })
  })

  it('stores the same numbers the pure function gives', async () => {
    const { deal } = await inHere(() => createDealFixture(nextTag()))
    const { id } = await inHere(() => createQuote({ dealId: deal.id, currency: 'EUR', lines: TWO_RATES }))
    const quote = await inHere(() => readQuote(id))
    const totals = quoteTotals(parseLines(TWO_RATES, 'EUR'))
    expect(quote!.subtotalMinor).toBe(totals.subtotalMinor)
    expect(quote!.taxMinor).toBe(totals.taxMinor)
    expect(quote!.totalMinor).toBe(totals.totalMinor)
    expect(quote!.lines.map(({ netMinor }) => netMinor)).toEqual(totals.lineNets)
    expect(quote!.subtotalMinor).toBe(big(47068)) // 200.00 + 270.68 (1.5 x 200.50, less 10%)
    expect(quote!.taxBreakdown).toEqual([
      { rateMilliPercent: 5500, baseMinor: '27068', taxMinor: '1489' },
      { rateMilliPercent: 20000, baseMinor: '20000', taxMinor: '4000' },
    ])
    expect(quote!.totalMinor).toBe(big(52557))
  })

  it('replaces its lines as a whole when saved, in order', async () => {
    const { deal } = await inHere(() => createDealFixture(nextTag()))
    const { id } = await inHere(() => createQuote({ dealId: deal.id, currency: 'EUR', lines: TWO_RATES }))
    await inHere(() => updateQuote(id, { lines: [{ description: 'Only this', quantity: 1, unitPrice: 10, taxRate: 0 }], notes: 'See you soon.' }))
    const quote = await inHere(() => readQuote(id))
    expect(quote!.lines.map(({ description, position }) => [description, position])).toEqual([['Only this', 0]])
    expect(quote!).toMatchObject({ notes: 'See you soon.', subtotalMinor: big(1000), taxMinor: big(0), totalMinor: big(1000) })
  })

  it("keeps its lines when only other fields change, and refuses what can't be right", async () => {
    const { deal } = await inHere(() => createDealFixture(nextTag()))
    const { id } = await inHere(() => createQuote({ dealId: deal.id, currency: 'EUR', lines: TWO_RATES, issueDate: '2026-11-01', validUntil: '2026-11-30' }))
    await inHere(() => updateQuote(id, { notes: 'Changed' }))
    expect((await inHere(() => readQuote(id)))!.lines).toHaveLength(2)
    await expect(inHere(() => updateQuote(id, { lines: [{ ...TWO_RATES[0], quantity: 0 }] }))).rejects.toThrow('Line 1: The quantity must be more than zero.')
    await expect(inHere(() => updateQuote(id, { validUntil: '2026-10-01' }))).rejects.toThrow('before the issue date')
    await expect(inHere(() => updateQuote(id, { validUntil: 'soon' }))).rejects.toThrow('yyyy-mm-dd')
    await expect(inHere(() => updateQuote(id, { currency: 'XXQ' }))).rejects.toThrow('currency code')
    await expect(inHere(() => updateQuote(id, { currency: 'JPY' }))).rejects.toThrow('Give the lines again')
    expect((await inHere(() => readQuote(id)))!).toMatchObject({ currency: 'EUR', lines: expect.arrayContaining([expect.objectContaining({ description: 'Setup' })]) })
    await inHere(() => updateQuote(id, { currency: 'JPY', lines: [{ description: 'In yen', quantity: 1, unitPrice: 1200, taxRate: 0 }] }))
    expect((await inHere(() => readQuote(id)))!).toMatchObject({ currency: 'JPY', totalMinor: big(1200) })
  })

  it("refuses a deal, company, contact or product from another workspace, and doesn't use up a number", async () => {
    const theirs = await inElsewhere(() => createDealFixture(nextTag()))
    const ours = await inHere(() => createDealFixture(nextTag()))
    const reference = async () => (await inHere(() => createQuote({ dealId: ours.deal.id }))).reference
    const before = Number(await reference())
    await expect(inHere(() => createQuote({ dealId: theirs.deal.id }))).rejects.toThrow("This deal doesn't exist.")
    await expect(inHere(() => createQuote({ dealId: ours.deal.id, contactId: theirs.contact.id }))).rejects.toThrow("This contact isn't in this workspace.")
    await expect(inHere(() => createQuote({ dealId: ours.deal.id, companyId: theirs.company.id }))).rejects.toThrow("This company isn't in this workspace.")
    await expect(inHere(() => createQuote({ dealId: ours.deal.id, lines: [{ ...TWO_RATES[0], productId: theirs.product.id }] }))).rejects.toThrow("A line's product isn't in this workspace.")
    expect(Number(await reference())).toBe(before + 1)
  })

  it('takes a deal soft-deleted as gone', async () => {
    const { deal } = await inHere(() => createDealFixture(nextTag()))
    await inHere(() => prisma.deal.update({ where: { id: deal.id }, data: { deletedAt: new Date() } }))
    await expect(inHere(() => createQuote({ dealId: deal.id }))).rejects.toThrow("This deal doesn't exist.")
  })
})

describe('a copy', () => {
  it('is a new draft under its own number, with the same content and a fresh validity', async () => {
    const { deal } = await inHere(() => createDealFixture(nextTag()))
    const source = await inHere(() => createQuote({ dealId: deal.id, currency: 'EUR', lines: TWO_RATES, issueDate: '2026-01-01', validUntil: '2026-01-11', notes: 'Note' }))
    const copy = await inHere(() => copyQuote(source.id))
    expect(copy.id).not.toBe(source.id)
    expect(Number(copy.reference)).toBe(Number(source.reference) + 1)
    const [before, after] = await inHere(() => Promise.all([readQuote(source.id), readQuote(copy.id)]))
    expect(after!.lines.map(({ description, netMinor }) => [description, netMinor])).toEqual(before!.lines.map(({ description, netMinor }) => [description, netMinor]))
    expect(after).toMatchObject({ status: 'DRAFT', dealId: deal.id, notes: 'Note', totalMinor: before!.totalMinor })
    expect(after!.validUntil.getTime() - after!.issueDate.getTime()).toBe(10 * 86_400_000)
    const events = await inHere(() => prisma.timelineEvent.findMany({ where: { dealId: deal.id, name: 'quote.created' }, orderBy: { happenedAt: 'asc' } }))
    expect(events.at(-1)!.properties).toEqual({ reference: copy.reference, copiedFrom: source.reference })
  })
})

describe('reading', () => {
  it('filters by status, working expired out from the date', async () => {
    const tag = nextTag()
    const { deal } = await inHere(() => createDealFixture(tag))
    const make = (data: object) =>
      inHere(async () => {
        const { id } = await createQuote({ dealId: deal.id })
        return prisma.quote.update({ where: { id }, data })
      })
    const draft = await make({})
    const live = await make({ status: 'SENT', validUntil: new Date('2099-01-01') })
    const expired = await make({ status: 'SENT', validUntil: new Date('2020-01-01') })
    const accepted = await make({ status: 'ACCEPTED' })
    const declined = await make({ status: 'DECLINED' })
    const ids = async (state?: QuoteState) => (await inHere(() => listQuotes({ state, dealId: deal.id }))).map(({ id }) => id)
    expect(await ids('DRAFT')).toEqual([draft.id])
    expect(await ids('SENT')).toEqual([live.id])
    expect(await ids('EXPIRED')).toEqual([expired.id])
    expect(await ids('ACCEPTED')).toEqual([accepted.id])
    expect(await ids('DECLINED')).toEqual([declined.id])
    expect(await ids()).toEqual([declined.id, accepted.id, expired.id, live.id, draft.id])
  })

  it('treats the last valid day as still good', () => {
    const now = new Date('2026-11-05T22:00:00Z')
    expect(quoteStateWhere('EXPIRED', now)).toEqual({ status: 'SENT', validUntil: { lt: new Date('2026-11-05T00:00:00.000Z') } })
    expect(quoteStateWhere('SENT', now)).toEqual({ status: 'SENT', validUntil: { gte: new Date('2026-11-05T00:00:00.000Z') } })
    expect(quoteStateWhere(undefined, now)).toEqual({})
  })

  it("doesn't find a quote from another workspace, or change or copy it", async () => {
    const { deal } = await inElsewhere(() => createDealFixture(nextTag()))
    const { id } = await inElsewhere(() => createQuote({ dealId: deal.id }))
    expect(await inHere(() => readQuote(id))).toBeNull()
    await expect(inHere(() => updateQuote(id, { notes: 'Stolen' }))).rejects.toThrow("This quote doesn't exist.")
    await expect(inHere(() => copyQuote(id))).rejects.toThrow("This quote doesn't exist.")
    expect((await inElsewhere(() => readQuote(id)))!.notes).toBeNull()
  })
})

describe('with nobody signed in and no assistant', () => {
  it('refuses to do anything for a stranger', async () => {
    const { deal } = await inHere(() => createDealFixture(nextTag()))
    await expect(here.run(() => createQuote({ dealId: deal.id }))).rejects.toThrow()
  })
})
