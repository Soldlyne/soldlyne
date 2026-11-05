import { describe, expect, it } from 'vitest'
import { decimalText, formatMinor, formatPercent, formatQuantity, isKnownCurrency, minorDigits, parseAmount, parseDecimal, parsePercent } from '../amounts'
import { parseLines } from '../lines'

const big = (value: number | string) => BigInt(value)

describe('reading what people type', () => {
  it.each([
    ['1500', big(150000)],
    ['1 500', big(150000)],
    ['1,500', big(150000)],
    ['1500.5', big(150050)],
    ['1500,50', big(150050)],
    ['0.07', big(7)],
    ['12.300', big(1230)],
    [19.99, big(1999)],
  ])('%s with 2 decimals', (text, expected) => {
    expect(parseDecimal(text, 2)).toBe(expected)
  })

  it.each(['', 'abc', '-5', '1.234,56', '1.999', '1e5', '1234567890123456'])('refuses %s rather than guess', (text) => {
    expect(parseDecimal(text, 2)).toBeNull()
  })

  it('goes by the currency: yen have no decimals, dinars three', () => {
    expect(minorDigits('EUR')).toBe(2)
    expect(minorDigits('JPY')).toBe(0)
    expect(minorDigits('KWD')).toBe(3)
    expect(parseAmount('1200', 'JPY')).toBe(big(1200))
    expect(() => parseAmount('12.5', 'JPY')).toThrow('JPY')
    expect(parseAmount('1.250', 'KWD')).toBe(big(1250))
  })

  it('knows real currencies only', () => {
    expect(isKnownCurrency('EUR')).toBe(true)
    expect(isKnownCurrency('XXQ')).toBe(false)
  })

  it('takes percentages from 0 to 100', () => {
    expect(parsePercent('20')).toBe(20_000)
    expect(parsePercent('5.5')).toBe(5500)
    expect(parsePercent('8,875')).toBe(8875)
    expect(parsePercent(19.6)).toBe(19600)
  })

  it('refuses percentages out of range', () => {
    expect(() => parsePercent('100.5')).toThrow('from 0 to 100')
    expect(() => parsePercent('-1')).toThrow('from 0 to 100')
  })
})

describe('writing it back', () => {
  it('keeps every digit', () => {
    expect(decimalText(big('12345678901234567'), 2)).toBe('123456789012345.67')
    expect(decimalText(big(5), 2)).toBe('0.05')
    expect(decimalText(big(1200), 0)).toBe('1200')
  })

  it('formats with the code and the decimals of the currency', () => {
    expect(formatMinor(big(123450), 'EUR').replace(/\s/g, ' ')).toBe('EUR 1,234.50')
    expect(formatMinor(big(1200), 'JPY').replace(/\s/g, ' ')).toBe('JPY 1,200')
    expect(formatMinor(big('12345678901234567'), 'EUR').replace(/\s/g, ' ')).toBe('EUR 123,456,789,012,345.67')
  })

  it('drops the zeros that say nothing', () => {
    expect(formatQuantity(big(1500))).toBe('1.5')
    expect(formatQuantity(big(2000))).toBe('2')
    expect(formatPercent(5500)).toBe('5.5%')
    expect(formatPercent(20000)).toBe('20%')
    expect(formatPercent(0)).toBe('0%')
  })
})

describe('lines as written', () => {
  const written = { description: 'Setup', quantity: '1.5', unitPrice: '100', taxRate: '20' }

  it('become exact integers', () => {
    expect(parseLines([{ ...written, discount: '10', productId: 'p1' }], 'EUR')).toEqual([{ description: 'Setup', productId: 'p1', quantityMilli: big(1500), unitPriceMinor: big(10000), taxRateMilliPercent: 20000, discountMilliPercent: 10000 }])
  })

  it('name the line they refuse', () => {
    expect(() => parseLines([written, { ...written, quantity: '0' }], 'EUR')).toThrow('Line 2: The quantity must be more than zero.')
    expect(() => parseLines([{ ...written, description: '  ' }], 'EUR')).toThrow('Line 1: The description is empty.')
    expect(() => parseLines([{ ...written, unitPrice: 'free' }], 'EUR')).toThrow('Line 1: "free"')
  })

  it('have a limit', () => {
    expect(() => parseLines(Array.from({ length: 201 }, () => written), 'EUR')).toThrow('up to 200 lines')
  })
})
