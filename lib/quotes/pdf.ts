import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib'
import { formatMinor, formatPercent, formatQuantity } from './amounts'
import type { QuoteDocument } from './document'
import { formatQuoteDate } from './status'

/** A quote on A4 pages, drawn on the server from the same document as the customer's page. */

const MM = 72 / 25.4
const PAGE = { width: 210 * MM, height: 297 * MM }
const MARGIN = 18 * MM
const WIDTH = PAGE.width - 2 * MARGIN
const FOOTER_ROOM = 12 * MM
const SIZE = 9
const SMALL = 8
const TITLE = 18
const LEADING = 12
const COLUMN_GAP = 10
const RULE_ABOVE = 8
const RULE_GAP = 5
/** A row up to this tall moves whole to the next page; a taller one would leave too much blank, and runs on instead. */
const TALLEST_WHOLE_ROW = PAGE.height / 2
const SHORTEST_DESCRIPTION = 70
const GREY = rgb(0.4, 0.4, 0.4)
const LINE_GREY = rgb(0.8, 0.8, 0.8)
const BLACK = rgb(0, 0, 0)
const NOT_SHOWABLE = '?'

/**
 * Helvetica only covers Western European characters, and drawing anything else throws. So each character
 * outside it becomes its nearest plain form ("ł" stays out, "Č" becomes "C"), or a visible "?" when it has
 * none, and the PDF then says that it left some out: the customer's page always holds the full text.
 */
function printer(font: PDFFont) {
  const known = new Set(font.getCharacterSet())
  const isKnown = (text: string) => [...text].every((char) => known.has(char.codePointAt(0) ?? -1))
  let replaced = false
  const printable = (char: string) => {
    if (isKnown(char)) return char
    if (/\s/.test(char)) return ' '
    if (/[\p{Cc}\p{Cf}\p{M}]/u.test(char)) return ''
    const plain = char.normalize('NFKD').replace(/\p{M}/gu, '')
    if (plain && isKnown(plain)) return plain
    replaced = true
    return NOT_SHOWABLE
  }
  return { clean: (text: string) => [...text.normalize('NFC')].map(printable).join(''), replacedAny: () => replaced }
}

type Sheet = {
  pdf: PDFDocument
  page: PDFPage
  top: number
  regular: PDFFont
  bold: PDFFont
  clean: (text: string) => string
  replacedAny: () => boolean
  /** Drawn at the top of each new page, while the line table is running. */
  repeatedHeader: ((sheet: Sheet) => void) | null
}

type TextStyle = { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> }

const fontOf = (sheet: Sheet, style: TextStyle) => style.font ?? sheet.regular

function drawAt(sheet: Sheet, text: string, x: number, style: TextStyle = {}) {
  sheet.page.drawText(text, { x, y: PAGE.height - sheet.top, size: style.size ?? SIZE, font: fontOf(sheet, style), color: style.color ?? BLACK })
}

function drawRight(sheet: Sheet, text: string, right: number, style: TextStyle = {}) {
  drawAt(sheet, text, right - fontOf(sheet, style).widthOfTextAtSize(text, style.size ?? SIZE), style)
}

function newPage(sheet: Sheet) {
  sheet.page = sheet.pdf.addPage([PAGE.width, PAGE.height])
  sheet.top = MARGIN + SIZE
  sheet.repeatedHeader?.(sheet)
}

function makeRoom(sheet: Sheet, height: number) {
  if (sheet.top + height > PAGE.height - MARGIN - FOOTER_ROOM) newPage(sheet)
}

/** A thin line above the next row of text, clear of it. */
function rule(sheet: Sheet) {
  const y = PAGE.height - sheet.top + RULE_ABOVE
  sheet.page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE.width - MARGIN, y }, thickness: 0.5, color: LINE_GREY })
  sheet.top += RULE_GAP
}

/** A word wider than the room is cut wherever it fills it: a pasted address or reference has no spaces to break at. */
function fitted(word: string, font: PDFFont, size: number, width: number): string[] {
  const pieces: string[] = []
  let piece = ''
  for (const char of word) {
    if (piece && font.widthOfTextAtSize(piece + char, size) > width) {
      pieces.push(piece)
      piece = char
    } else piece += char
  }
  return [...pieces, piece]
}

function wrappedParagraph(paragraph: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = []
  let current = ''
  for (const word of paragraph.split(/\s+/).flatMap((whole) => fitted(whole, font, size, width))) {
    const candidate = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= width) current = candidate
    else {
      lines.push(current)
      current = word
    }
  }
  return [...lines, current]
}

/** Lines of text as typed, then each broken to fit. Split first: cleaning would turn a line break into a space. */
const wrapped = (sheet: Sheet, text: string, font: PDFFont, size: number, width: number) => text.split(/\r\n?|\n/).flatMap((paragraph) => wrappedParagraph(sheet.clean(paragraph), font, size, width))

/** Text of any length from the left margin, running on to the next page when it must. */
function flowing(sheet: Sheet, text: string, style: TextStyle = {}) {
  for (const line of wrapped(sheet, text, fontOf(sheet, style), style.size ?? SIZE, WIDTH)) {
    makeRoom(sheet, LEADING)
    drawAt(sheet, line, MARGIN, style)
    sheet.top += LEADING
  }
}

function stateLine({ state, accepted, declinedAt }: QuoteDocument, clean: (text: string) => string): string | null {
  if (state === 'DRAFT') return 'Draft: not sent'
  if (accepted) return clean(`Accepted by ${accepted.name} on ${formatQuoteDate(accepted.at)}`)
  if (declinedAt) return `Declined on ${formatQuoteDate(declinedAt)}`
  return state === 'EXPIRED' ? 'Expired' : null
}

function drawHeading(sheet: Sheet, document: QuoteDocument) {
  const right = PAGE.width - MARGIN
  const { seller, reference, issueDate, validUntil } = document
  const column = WIDTH * 0.6
  const start = sheet.top
  const details = [...wrapped(sheet, seller.address, sheet.regular, SIZE, column), seller.companyNumber && `Company number: ${seller.companyNumber}`, seller.vatNumber && `VAT number: ${seller.vatNumber}`, seller.contactEmail]
  for (const line of wrapped(sheet, seller.legalName, sheet.bold, SIZE + 2, column)) {
    drawAt(sheet, line, MARGIN, { font: sheet.bold, size: SIZE + 2 })
    sheet.top += LEADING + 2
  }
  for (const line of details.filter(Boolean)) {
    for (const piece of wrapped(sheet, String(line), sheet.regular, SIZE, column)) {
      drawAt(sheet, piece, MARGIN)
      sheet.top += LEADING
    }
  }
  const sellerEnd = sheet.top
  sheet.top = start + 4
  drawRight(sheet, 'Quote', right, { font: sheet.bold, size: TITLE })
  sheet.top += LEADING + 6
  const dates = [`No. ${sheet.clean(reference)}`, `Issued ${formatQuoteDate(issueDate)}`, `Valid until ${formatQuoteDate(validUntil)}`, stateLine(document, sheet.clean)]
  for (const line of dates.filter((text): text is string => Boolean(text))) {
    drawRight(sheet, line, right)
    sheet.top += LEADING
  }
  sheet.top = Math.max(sellerEnd, sheet.top) + LEADING
}

function drawCustomer(sheet: Sheet, { customer }: QuoteDocument) {
  drawAt(sheet, 'For', MARGIN, { color: GREY, size: SMALL })
  sheet.top += LEADING
  const place = [customer.city, customer.country].filter(Boolean).join(', ')
  for (const line of [customer.companyName, customer.contactName, customer.contactEmail, place].filter(Boolean)) flowing(sheet, line)
  sheet.top += LEADING
}

type Row = { quantity: string; price: string; discount: string; tax: string; net: string }

const HEADINGS: Row & { description: string } = { description: 'Description', quantity: 'Qty', price: 'Unit price', discount: 'Disc.', tax: 'Tax', net: 'Net' }
const NUMERIC_COLUMNS = ['quantity', 'price', 'discount', 'tax', 'net'] as const

const rowOf = ({ currency }: QuoteDocument, line: QuoteDocument['lines'][number]): Row => ({
  quantity: formatQuantity(line.quantityMilli),
  price: sheetMoney(line.unitPriceMinor, currency),
  discount: line.discountMilliPercent ? formatPercent(line.discountMilliPercent) : '',
  tax: formatPercent(line.taxRateMilliPercent),
  net: sheetMoney(line.netMinor, currency),
})

/** No-break spaces read the same, and the font has no need of them. */
const sheetMoney = (amount: bigint, currency: string) => formatMinor(amount, currency).replace(/\s/g, ' ')

/** Where each number column ends, as wide as its widest cell: a very large amount takes room from the description, and never runs into its neighbour. */
function columnEnds(sheet: Sheet, rows: Row[]) {
  const widthOf = (text: string) => sheet.regular.widthOfTextAtSize(text, SIZE)
  const widths = NUMERIC_COLUMNS.map((column) => Math.max(widthOf(HEADINGS[column]), ...rows.map((row) => widthOf(row[column]))))
  let right = PAGE.width - MARGIN
  const ends = {} as Record<(typeof NUMERIC_COLUMNS)[number], number>
  for (let index = NUMERIC_COLUMNS.length - 1; index >= 0; index--) {
    ends[NUMERIC_COLUMNS[index]] = right
    right -= widths[index] + COLUMN_GAP
  }
  return { ends, descriptionWidth: Math.max(right - MARGIN, SHORTEST_DESCRIPTION) }
}

function drawLines(sheet: Sheet, document: QuoteDocument) {
  const rows = document.lines.map((line) => rowOf(document, line))
  const { ends, descriptionWidth } = columnEnds(sheet, rows)
  const header = (target: Sheet) => {
    drawAt(target, HEADINGS.description, MARGIN, { color: GREY, size: SMALL })
    for (const column of NUMERIC_COLUMNS) drawRight(target, HEADINGS[column], ends[column], { color: GREY, size: SMALL })
    target.top += LEADING
    rule(target)
  }
  makeRoom(sheet, LEADING * 3)
  sheet.repeatedHeader = header
  header(sheet)
  document.lines.forEach((line, index) => {
    const descriptionLines = wrapped(sheet, line.description, sheet.regular, SIZE, descriptionWidth)
    const rowHeight = LEADING * descriptionLines.length
    makeRoom(sheet, rowHeight <= TALLEST_WHOLE_ROW ? rowHeight : LEADING)
    for (const column of NUMERIC_COLUMNS) drawRight(sheet, rows[index][column], ends[column])
    descriptionLines.forEach((text, position) => {
      if (position > 0) makeRoom(sheet, LEADING)
      drawAt(sheet, text, MARGIN)
      sheet.top += LEADING
    })
    sheet.top += 3
  })
  sheet.repeatedHeader = null
}

function drawTotals(sheet: Sheet, { currency, subtotalMinor, taxes, totalMinor }: QuoteDocument) {
  const rows = [['Subtotal', sheetMoney(subtotalMinor, currency)], ...taxes.map((tax) => [`Tax ${formatPercent(tax.rateMilliPercent)} on ${sheetMoney(tax.baseMinor, currency)}`, sheetMoney(tax.taxMinor, currency)])]
  makeRoom(sheet, LEADING * (rows.length + 3))
  rule(sheet)
  const right = PAGE.width - MARGIN
  const amountWidth = Math.max(...rows.map(([, amount]) => sheet.regular.widthOfTextAtSize(amount, SIZE)), sheet.bold.widthOfTextAtSize(sheetMoney(totalMinor, currency), SIZE + 1))
  for (const [label, amount] of rows) {
    drawRight(sheet, label, right - amountWidth - COLUMN_GAP)
    drawRight(sheet, amount, right)
    sheet.top += LEADING
  }
  drawRight(sheet, 'Total', right - amountWidth - COLUMN_GAP, { font: sheet.bold, size: SIZE + 1 })
  drawRight(sheet, sheetMoney(totalMinor, currency), right, { font: sheet.bold, size: SIZE + 1 })
  sheet.top += LEADING * 2
}

function drawTextBlock(sheet: Sheet, title: string, text: string | null) {
  if (!text?.trim()) return
  makeRoom(sheet, LEADING * 2)
  drawAt(sheet, title, MARGIN, { color: GREY, size: SMALL })
  sheet.top += LEADING
  flowing(sheet, text)
  sheet.top += LEADING
}

/** Page numbers go on last, once it's known how many pages there are. */
function drawFooters(sheet: Sheet, { reference, seller }: QuoteDocument) {
  const pages = sheet.pdf.getPages()
  pages.forEach((page, index) => {
    const label = sheet.clean(`Quote ${reference} - ${seller.legalName}`)
    const fitting = fitted(label, sheet.regular, SMALL, WIDTH * 0.7)[0]
    const number = `Page ${index + 1} of ${pages.length}`
    page.drawText(fitting, { x: MARGIN, y: MARGIN, size: SMALL, font: sheet.regular, color: GREY })
    page.drawText(number, { x: PAGE.width - MARGIN - sheet.regular.widthOfTextAtSize(number, SMALL), y: MARGIN, size: SMALL, font: sheet.regular, color: GREY })
  })
}

export async function quotePdf(document: QuoteDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`Quote ${document.reference}`)
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const { clean, replacedAny } = printer(regular)
  const sheet: Sheet = { pdf, page: pdf.addPage([PAGE.width, PAGE.height]), top: MARGIN + SIZE, regular, bold, clean, replacedAny, repeatedHeader: null }
  drawHeading(sheet, document)
  drawCustomer(sheet, document)
  drawLines(sheet, document)
  drawTotals(sheet, document)
  drawTextBlock(sheet, 'Notes', document.notes)
  drawTextBlock(sheet, 'Terms', document.terms)
  if (sheet.replacedAny()) flowing(sheet, 'Some characters could not be shown in this PDF and appear as "?". The quote\'s page online shows them in full.', { color: GREY, size: SMALL })
  drawFooters(sheet, document)
  return pdf.save()
}

const unsafeInFileName = /[^\w.-]+/g

/** "quote-2026-0042.pdf". */
export const quotePdfName = (reference: string) => `quote-${reference.replace(unsafeInFileName, '-')}.pdf`
