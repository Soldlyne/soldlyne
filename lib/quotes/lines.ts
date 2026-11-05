import { decimalText, minorDigits, parseAmount, parseDecimal, parsePercent, PERCENT_DIGITS, QUANTITY_DIGITS, shortDecimalText } from './amounts'
import { QuoteRefusal } from './refusal'
import { lineNet, type PricedLine } from './totals'

/** A line as a person or an assistant writes it: decimal text or numbers, in the quote's currency and in percent. */
export type LineInput = {
  description: string
  quantity: string | number
  unitPrice: string | number
  taxRate: string | number
  discount?: string | number | null
  productId?: string | null
}

export type ParsedLine = PricedLine & { description: string; productId: string | null }

export const MOST_LINES = 200
const LONGEST_DESCRIPTION = 2000

function parseQuantity(text: string | number): bigint {
  const parsed = parseDecimal(text, QUANTITY_DIGITS)
  if (parsed === null) throw new QuoteRefusal(`"${text}" isn't a quantity: use up to ${QUANTITY_DIGITS} decimals.`)
  return parsed
}

const isBlank = (value: string | number | null | undefined) => value === null || value === undefined || String(value).trim() === ''

function parseLine(input: LineInput, currency: string): ParsedLine {
  const description = input.description.trim()
  if (!description) throw new QuoteRefusal('The description is empty.')
  if (description.length > LONGEST_DESCRIPTION) throw new QuoteRefusal(`The description is longer than ${LONGEST_DESCRIPTION} characters.`)
  const line = {
    description,
    productId: input.productId || null,
    quantityMilli: parseQuantity(input.quantity),
    unitPriceMinor: parseAmount(input.unitPrice, currency),
    taxRateMilliPercent: parsePercent(input.taxRate),
    discountMilliPercent: isBlank(input.discount) ? null : parsePercent(input.discount as string | number),
  }
  lineNet(line)
  return line
}

/** Every line read and checked, or a refusal naming the first that can't be. The screen's live totals use this too, so they can't differ from what is saved. */
export function parseLines(inputs: LineInput[], currency: string): ParsedLine[] {
  if (inputs.length > MOST_LINES) throw new QuoteRefusal(`A quote can hold up to ${MOST_LINES} lines.`)
  return inputs.map((input, index) => {
    try {
      return parseLine(input, currency)
    } catch (error) {
      throw error instanceof QuoteRefusal ? new QuoteRefusal(`Line ${index + 1}: ${error.message}`) : error
    }
  })
}

const percentText = (milliPercent: number) => shortDecimalText(BigInt(milliPercent), PERCENT_DIGITS)

/** A stored line back as what a person typed, for the editor. */
export const lineAsText = ({ description, productId, quantityMilli, unitPriceMinor, taxRateMilliPercent, discountMilliPercent }: ParsedLine, currency: string) => ({
  description,
  productId,
  quantity: shortDecimalText(quantityMilli, QUANTITY_DIGITS),
  unitPrice: decimalText(unitPriceMinor, minorDigits(currency)),
  taxRate: percentText(taxRateMilliPercent),
  discount: discountMilliPercent === null || discountMilliPercent === undefined ? '' : percentText(discountMilliPercent),
})

export type LineAsText = ReturnType<typeof lineAsText>
