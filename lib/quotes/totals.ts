import { QuoteRefusal } from './refusal'

/**
 * The one place a quote's numbers are worked out. Exact integers throughout, and two rules:
 *
 * - Each line's net (quantity x unit price, less its discount) is rounded to the minor unit.
 * - Tax is worked out once per rate, on the sum of that rate's nets, not per line and then added: a
 *   line's rounding would otherwise pile up, and the tax shown wouldn't be the rate of the base shown.
 *
 * Rounding is half up: exactly half a minor unit goes up. No amount here is ever negative.
 */

export type PricedLine = {
  quantityMilli: bigint
  unitPriceMinor: bigint
  taxRateMilliPercent: number
  discountMilliPercent?: number | null
}

export type TaxAtRate = { rateMilliPercent: number; baseMinor: bigint; taxMinor: bigint }

export type QuoteTotals = {
  /** Each line's net before tax, in the order given. */
  lineNets: bigint[]
  subtotalMinor: bigint
  /** One per rate, lowest rate first. */
  taxes: TaxAtRate[]
  taxMinor: bigint
  totalMinor: bigint
}

const ZERO = BigInt(0)
const TWO = BigInt(2)
const A_THOUSAND = BigInt(1000)
const WHOLE_PERCENT = 100_000
const ALL = BigInt(WHOLE_PERCENT)

/** Well inside what the database's big integers hold, once every line and tax is added. */
export const MOST_MINOR_UNITS = BigInt('100000000000000000')

const halfUp = (numerator: bigint, denominator: bigint) => (TWO * numerator + denominator) / (TWO * denominator)

const inPercentRange = (milliPercent: number) => Number.isInteger(milliPercent) && milliPercent >= 0 && milliPercent <= WHOLE_PERCENT

function checkLine({ quantityMilli, unitPriceMinor, taxRateMilliPercent, discountMilliPercent }: PricedLine) {
  if (quantityMilli <= ZERO) throw new QuoteRefusal('The quantity must be more than zero.')
  if (unitPriceMinor < ZERO) throw new QuoteRefusal("The unit price can't be negative.")
  if (!inPercentRange(taxRateMilliPercent)) throw new QuoteRefusal('The tax rate must be from 0 to 100%.')
  if (!inPercentRange(discountMilliPercent ?? 0)) throw new QuoteRefusal('The discount must be from 0 to 100%.')
}

/** One line's amount before tax. Exact until this single rounding, however large the numbers. */
export function lineNet(line: PricedLine): bigint {
  checkLine(line)
  const kept = ALL - BigInt(line.discountMilliPercent ?? 0)
  return halfUp(line.quantityMilli * line.unitPriceMinor * kept, A_THOUSAND * ALL)
}

function taxesOf(lines: PricedLine[], nets: bigint[]): TaxAtRate[] {
  const baseByRate = new Map<number, bigint>()
  lines.forEach(({ taxRateMilliPercent: rate }, index) => baseByRate.set(rate, (baseByRate.get(rate) ?? ZERO) + nets[index]))
  return [...baseByRate.entries()].sort(([a], [b]) => a - b).map(([rateMilliPercent, baseMinor]) => ({ rateMilliPercent, baseMinor, taxMinor: halfUp(baseMinor * BigInt(rateMilliPercent), ALL) }))
}

const sum = (amounts: bigint[]) => amounts.reduce((total, amount) => total + amount, ZERO)

export function quoteTotals(lines: PricedLine[]): QuoteTotals {
  const lineNets = lines.map(lineNet)
  const taxes = taxesOf(lines, lineNets)
  const subtotalMinor = sum(lineNets)
  const taxMinor = sum(taxes.map(({ taxMinor: tax }) => tax))
  const totalMinor = subtotalMinor + taxMinor
  if (totalMinor > MOST_MINOR_UNITS) throw new QuoteRefusal("This quote's total is too large.")
  return { lineNets, subtotalMinor, taxes, taxMinor, totalMinor }
}

/** The per-rate tax as a quote stores it: JSON has no big integers. */
export const storedTaxes = (taxes: TaxAtRate[]) => taxes.map(({ rateMilliPercent, baseMinor, taxMinor }) => ({ rateMilliPercent, baseMinor: baseMinor.toString(), taxMinor: taxMinor.toString() }))

export function readStoredTaxes(stored: unknown): TaxAtRate[] {
  return (stored as ReturnType<typeof storedTaxes>).map(({ rateMilliPercent, baseMinor, taxMinor }) => ({ rateMilliPercent, baseMinor: BigInt(baseMinor), taxMinor: BigInt(taxMinor) }))
}
