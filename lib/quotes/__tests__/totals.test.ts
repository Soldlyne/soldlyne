import { describe, expect, it } from 'vitest'
import { lineNet, MOST_MINOR_UNITS, quoteTotals, readStoredTaxes, storedTaxes, type PricedLine } from '../totals'

const big = (value: number | string) => BigInt(value)
const line = (quantity: number, unitPrice: number | string, rate: number, discount?: number): PricedLine => ({ quantityMilli: big(quantity * 1000), unitPriceMinor: big(unitPrice), taxRateMilliPercent: rate * 1000, discountMilliPercent: discount === undefined ? null : discount * 1000 })

describe('a line', () => {
  it('is quantity times price', () => {
    expect(lineNet(line(3, 1250, 20))).toBe(big(3750))
  })

  it('takes a fractional quantity, and rounds half a minor unit up', () => {
    // 1.25 x 0.10 is 0.125 exactly.
    expect(lineNet({ quantityMilli: big(1250), unitPriceMinor: big(10), taxRateMilliPercent: 0 })).toBe(big(13))
    // 1.24 x 0.10 is 0.124.
    expect(lineNet({ quantityMilli: big(1240), unitPriceMinor: big(10), taxRateMilliPercent: 0 })).toBe(big(12))
  })

  it('takes its discount off before rounding', () => {
    expect(lineNet(line(1, 999, 20, 10))).toBe(big(899)) // 8.991
    expect(lineNet(line(1, 1000, 20, 12.5))).toBe(big(875))
    expect(lineNet(line(1, 5, 0, 50))).toBe(big(3)) // 0.025 goes up
    expect(lineNet(line(2, 1000, 20, 100))).toBe(big(0))
  })

  it('can be free', () => {
    expect(lineNet(line(5, 0, 20))).toBe(big(0))
  })

  it.each([
    ['zero quantity', { ...line(1, 100, 20), quantityMilli: big(0) }, 'quantity'],
    ['negative quantity', { ...line(1, 100, 20), quantityMilli: big(-1000) }, 'quantity'],
    ['negative price', { ...line(1, 100, 20), unitPriceMinor: big(-1) }, 'unit price'],
    ['tax above 100%', { ...line(1, 100, 20), taxRateMilliPercent: 100_001 }, 'tax rate'],
    ['negative tax', { ...line(1, 100, 20), taxRateMilliPercent: -1 }, 'tax rate'],
    ['discount above 100%', { ...line(1, 100, 20), discountMilliPercent: 100_001 }, 'discount'],
  ])('refuses %s', (_name, bad, word) => {
    expect(() => lineNet(bad)).toThrow(word)
    expect(() => quoteTotals([bad])).toThrow(word)
  })
})

describe('the totals', () => {
  it('are all zero with no lines', () => {
    expect(quoteTotals([])).toEqual({ lineNets: [], subtotalMinor: big(0), taxes: [], taxMinor: big(0), totalMinor: big(0) })
  })

  it('show tax per rate, lowest first, and add up', () => {
    const totals = quoteTotals([line(2, 10000, 20), line(1, 5000, 5.5), line(3, 1000, 20), line(1, 700, 0)])
    expect(totals.lineNets).toEqual([big(20000), big(5000), big(3000), big(700)])
    expect(totals.subtotalMinor).toBe(big(28700))
    expect(totals.taxes).toEqual([
      { rateMilliPercent: 0, baseMinor: big(700), taxMinor: big(0) },
      { rateMilliPercent: 5500, baseMinor: big(5000), taxMinor: big(275) },
      { rateMilliPercent: 20000, baseMinor: big(23000), taxMinor: big(4600) },
    ])
    expect(totals.taxMinor).toBe(big(4875))
    expect(totals.totalMinor).toBe(big(33575))
  })

  it('work tax out on the sum of a rate, not line by line', () => {
    // 0.10 at 5% is half a cent: three lines rounded alone would make 3 cents, 0.30 at 5% is 1.5, so 2.
    const { taxes, taxMinor, totalMinor } = quoteTotals([line(1, 10, 5), line(1, 10, 5), line(1, 10, 5)])
    expect(taxes).toEqual([{ rateMilliPercent: 5000, baseMinor: big(30), taxMinor: big(2) }])
    expect(taxMinor).toBe(big(2))
    expect(totalMinor).toBe(big(32))
  })

  it('round half a minor unit of tax up, and less than half down', () => {
    expect(quoteTotals([line(1, 50, 1)]).taxMinor).toBe(big(1)) // 0.50 at 1% is 0.5 cent
    expect(quoteTotals([line(1, 49, 1)]).taxMinor).toBe(big(0))
    expect(quoteTotals([line(1, 3333, 20)]).taxMinor).toBe(big(667)) // 6.666
  })

  it('take a rate with three decimals', () => {
    const totals = quoteTotals([{ ...line(1, 10000, 0), taxRateMilliPercent: 8875 }])
    expect(totals.taxes[0].taxMinor).toBe(big(888)) // 887.5 goes up
  })

  it('stay exact with very large numbers, where a float would drift', () => {
    const totals = quoteTotals([{ quantityMilli: big('999999999999'), unitPriceMinor: big('12345678'), taxRateMilliPercent: 19_600 }])
    // 999999999.999 x 12345678 is 12345677999987654.322, and 19.6% of the rounded amount is ...7580.184.
    expect(totals.subtotalMinor).toBe(big('12345677999987654'))
    expect(totals.taxMinor).toBe(big('2419752887997580'))
    expect(totals.totalMinor).toBe(big('14765430887985234'))
  })

  it('refuse a total too large to keep', () => {
    expect(() => quoteTotals([{ quantityMilli: big('999999999999999'), unitPriceMinor: MOST_MINOR_UNITS, taxRateMilliPercent: 0 }])).toThrow('too large')
  })

  it('keep the same taxes through storing and reading', () => {
    const { taxes } = quoteTotals([line(2, 10000, 20), line(1, 5000, 5.5)])
    expect(readStoredTaxes(JSON.parse(JSON.stringify(storedTaxes(taxes))))).toEqual(taxes)
  })
})
