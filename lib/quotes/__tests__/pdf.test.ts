import { inflateSync } from 'node:zlib'
import { PDFDocument, PDFRawStream } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import type { QuoteDocument } from '../document'
import { quotePdf, quotePdfName } from '../pdf'
import { quoteTotals, type PricedLine } from '../totals'

const big = (value: number | string) => BigInt(value)

function documentWith(lines: (PricedLine & { description: string })[], overrides: Partial<QuoteDocument> = {}): QuoteDocument {
  const totals = quoteTotals(lines)
  return {
    reference: '2026-0042',
    state: 'SENT',
    currency: 'EUR',
    issueDate: new Date('2026-11-05T00:00:00Z'),
    validUntil: new Date('2026-12-05T00:00:00Z'),
    notes: 'Delivered in two steps.',
    terms: 'Payment within 30 days.',
    seller: { legalName: 'Northwind Works', address: '1 Example Street\n75000 Paris', companyNumber: '123 456 789', vatNumber: 'FR00123456789', contactEmail: 'sales@northwind.example' },
    customer: { companyName: 'Acme', city: 'Lyon', country: 'France', contactName: 'Ada Martin', contactEmail: 'ada@acme.example' },
    lines: lines.map((line, index) => ({ description: line.description, quantityMilli: line.quantityMilli, unitPriceMinor: line.unitPriceMinor, taxRateMilliPercent: line.taxRateMilliPercent, discountMilliPercent: line.discountMilliPercent ?? null, netMinor: totals.lineNets[index] })),
    subtotalMinor: totals.subtotalMinor,
    taxes: totals.taxes,
    taxMinor: totals.taxMinor,
    totalMinor: totals.totalMinor,
    accepted: null,
    declinedAt: null,
    ...overrides,
  }
}

const line = (description: string, quantity: number, price: number, rate: number): PricedLine & { description: string } => ({ description, quantityMilli: big(quantity * 1000), unitPriceMinor: big(price), taxRateMilliPercent: rate * 1000 })

/** The text a PDF draws, read back from its page contents: pdf-lib writes each run as a hex string in WinAnsi. */
async function textOf(bytes: Uint8Array): Promise<{ pages: number; text: string; runsPerStream: string[][] }> {
  const pdf = await PDFDocument.load(bytes)
  const streams = pdf.context.enumerateIndirectObjects().flatMap(([, object]) => (object instanceof PDFRawStream ? [Buffer.from(object.contents)] : []))
  const contents = streams.map((stream) => {
    try {
      return inflateSync(stream).toString('latin1')
    } catch {
      return ''
    }
  })
  const windows1252 = new TextDecoder('windows-1252')
  const runsPerStream = contents.map((content) => [...content.matchAll(/<([0-9A-Fa-f]+)> Tj/g)].map(([, hex]) => windows1252.decode(Buffer.from(hex, 'hex'))))
  return { pages: pdf.getPageCount(), text: runsPerStream.flat().join('\n'), runsPerStream }
}

describe('the PDF', () => {
  it('states who, what, and totals that add up, with tax per rate', async () => {
    const { pages, text } = await textOf(await quotePdf(documentWith([line('Setup', 2, 10000, 20), line('Training', 1, 5000, 5.5)])))
    expect(pages).toBe(1)
    for (const part of ['Northwind Works', '123 456 789', 'FR00123456789', 'Acme', 'Ada Martin', 'No. 2026-0042', 'Valid until 5 Dec 2026', 'Setup', 'Training', 'EUR 200.00', 'EUR 250.00', 'Tax 5.5% on EUR 50.00', 'EUR 2.75', 'Tax 20% on EUR 200.00', 'EUR 40.00', 'EUR 292.75', 'Delivered in two steps.', 'Payment within 30 days.']) expect(text).toContain(part)
  })

  it('runs over several pages, repeating the table heading and numbering them', async () => {
    const lines = Array.from({ length: 120 }, (_, index) => line(`Line number ${index + 1}`, 1, 1000, 20))
    const { pages, text } = await textOf(await quotePdf(documentWith(lines)))
    expect(pages).toBeGreaterThan(1)
    expect(text).toContain('Line number 1')
    expect(text).toContain('Line number 120')
    expect(text).toContain(`Page ${pages} of ${pages}`)
    // Each page the table runs on has its heading; the totals may well land on a page of their own.
    expect(text.match(/Unit price/g)?.length).toBeGreaterThanOrEqual(pages - 1)
    expect(text).toContain('EUR 1,440.00')
  })

  it('moves a row of a few lines whole to the next page rather than splitting it', async () => {
    const wordy = 'A description that wraps over several lines in the table, since it runs on and on well past the width of its column and then some more, to be sure of it.'
    const { pages, runsPerStream } = await textOf(await quotePdf(documentWith(Array.from({ length: 40 }, () => line(wordy, 1, 1000, 20)), { notes: null, terms: null })))
    expect(pages).toBeGreaterThan(1)
    // A row draws its numbers first: a page that carried on a split row would have text right after the heading.
    const continued = runsPerStream.filter((runs) => runs[0] === 'Description')
    expect(continued.length).toBeGreaterThan(0)
    for (const runs of continued) expect(runs[runs.indexOf('Net') + 1]).toBe('1')
  })

  it('breaks a description too long for one page, and a word too wide for its column', async () => {
    const long = `${'word '.repeat(1500)}${'x'.repeat(600)}`
    const { pages, text } = await textOf(await quotePdf(documentWith([line(long, 1, 1000, 20)], { lines: [{ description: long, quantityMilli: big(1000), unitPriceMinor: big('99999999999999999'), taxRateMilliPercent: 20000, discountMilliPercent: 10000, netMinor: big('89999999999999999') }] })))
    expect(pages).toBeGreaterThanOrEqual(1)
    expect(text).toContain('xxxx')
  })

  it("doesn't stop at characters its font lacks, and says it left them out", async () => {
    const { text, pages } = await textOf(await quotePdf(documentWith([line('数据迁移 😀 Миграция', 1, 1000, 20), line('Čeština crème brûlée', 1, 1000, 20)], { customer: { companyName: '東京株式会社', city: '', country: '', contactName: 'Ada Martin', contactEmail: 'ada@acme.example' } })))
    expect(pages).toBe(1)
    expect(text).toContain('????')
    expect(text).toContain('Čeština crème brûlée'.replace('Č', 'C'))
    expect(text).toContain('Ada Martin')
    expect(text).toContain('could not be shown')
  })

  it('says nothing about left-out characters when there are none', async () => {
    const { text } = await textOf(await quotePdf(documentWith([line('Crème brûlée – “spécial” €', 1, 1000, 20)])))
    expect(text).toContain('Crème brûlée – “spécial” €')
    expect(text).not.toContain('could not be shown')
  })

  it('survives tabs, control characters and empty fields', async () => {
    const bytes = await quotePdf(documentWith([line('A\tB\u0007C\r\nD', 1, 1000, 0)], { notes: null, terms: '  ', seller: { legalName: '', address: '', companyNumber: '', vatNumber: '', contactEmail: '' }, customer: { companyName: '', city: '', country: '', contactName: '', contactEmail: '' } }))
    expect((await textOf(bytes)).text).toContain('A BC')
  })

  it('keeps line breaks as typed: an address is several lines', async () => {
    const { text } = await textOf(await quotePdf(documentWith([line('First line\nSecond line', 1, 1000, 0)], { notes: 'One\r\nTwo' })))
    for (const part of ['1 Example Street', '75000 Paris', 'First line', 'Second line', 'One', 'Two']) expect(text.split('\n')).toContain(part)
  })

  it('takes a currency with no decimals', async () => {
    const lines = [line('Item', 3, 1200, 10)]
    const { text } = await textOf(await quotePdf(documentWith(lines, { currency: 'JPY' })))
    expect(text).toContain('JPY 3,600')
    expect(text).toContain('JPY 3,960')
  })

  it('says when a quote was accepted, or is a draft', async () => {
    const accepted = await textOf(await quotePdf(documentWith([line('Item', 1, 100, 0)], { state: 'ACCEPTED', accepted: { name: 'Ada Martin', at: new Date('2026-11-06T10:00:00Z') } })))
    expect(accepted.text).toContain('Accepted by Ada Martin on 6 Nov 2026')
    expect((await textOf(await quotePdf(documentWith([line('Item', 1, 100, 0)], { state: 'DRAFT' })))).text).toContain('Draft: not sent')
  })

  it('has a safe file name', () => {
    expect(quotePdfName('2026-0042')).toBe('quote-2026-0042.pdf')
    expect(quotePdfName('../a b"c')).toBe('quote-..-a-b-c.pdf')
  })
})
