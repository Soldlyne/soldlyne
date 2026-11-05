import { QuoteRefusal } from './refusal'

/**
 * Quotes keep every number as an exact integer, so these go to and from what people type and read
 * through text, never through a float: amounts in minor units of a currency, quantities in thousandths
 * of a unit, percentages in thousandths of a percent.
 */

export const QUANTITY_DIGITS = 3
export const PERCENT_DIGITS = 3

const ALL_OF_IT = BigInt(100_000)

/** More digits than this before the point is a slip of the hand, and past what a total can hold. */
const LONGEST_WHOLE_PART = 15

const moneyFormat = (currency: string) => new Intl.NumberFormat('en-GB', { style: 'currency', currency, currencyDisplay: 'code' })

/** How many decimals this currency's minor unit has: 2 for euros, 0 for yen, 3 for Kuwaiti dinars. */
export const minorDigits = (currency: string) => moneyFormat(currency).resolvedOptions().maximumFractionDigits ?? 2

export const isKnownCurrency = (code: string) => Intl.supportedValuesOf('currency').includes(code)

/** "1 500", "1500.50", "1,500" or "1500,5" as an integer with this many decimals; null when it can't be read, or holds more decimals than that. */
export function parseDecimal(text: string | number, digits: number): bigint | null {
  const cleaned = String(text).replace(/\s/g, '').replace(/,(?=\d{1,2}$)/, '.').replace(/,/g, '')
  const match = cleaned.match(/^(\d+)(?:\.(\d+))?$/)
  if (!match || match[1].length > LONGEST_WHOLE_PART) return null
  const fraction = (match[2] ?? '').replace(/0+$/, '')
  if (fraction.length > digits) return null
  return BigInt(match[1] + fraction.padEnd(digits, '0'))
}

/** An integer with this many decimals as plain decimal text: 123450 with 2 is "1234.50". */
export function decimalText(value: bigint, digits: number): string {
  const text = value.toString().padStart(digits + 1, '0')
  return digits === 0 ? text : `${text.slice(0, -digits)}.${text.slice(-digits)}`
}

/** The same, with the zeros that say nothing left off: 1500 with 3 is "1.5". */
export const shortDecimalText = (value: bigint, digits: number) => (digits === 0 ? value.toString() : decimalText(value, digits).replace(/\.?0+$/, ''))

/** "EUR 1,234.50". The code rather than a symbol: the PDF's font has no ₹ or ₽, and a quote should read the same everywhere. */
export const formatMinor = (amount: bigint, currency: string) => moneyFormat(currency).format(decimalText(amount, minorDigits(currency)) as `${number}`)

export const formatQuantity = (quantityMilli: bigint) => shortDecimalText(quantityMilli, QUANTITY_DIGITS)

export const formatPercent = (milliPercent: number) => `${shortDecimalText(BigInt(milliPercent), PERCENT_DIGITS)}%`

/** An amount a person typed, in the currency's own decimals. */
export function parseAmount(text: string | number, currency: string): bigint {
  const parsed = parseDecimal(text, minorDigits(currency))
  if (parsed === null) throw new QuoteRefusal(`"${text}" isn't an amount in ${currency}.`)
  return parsed
}

/** A percentage a person typed, from 0 to 100. A comma can only be a decimal point here: nobody's tax rate has thousands. */
export function parsePercent(text: string | number): number {
  const parsed = parseDecimal(String(text).replace(',', '.'), PERCENT_DIGITS)
  if (parsed === null || parsed > ALL_OF_IT) throw new QuoteRefusal(`"${text}" isn't a percentage from 0 to 100.`)
  return Number(parsed)
}
