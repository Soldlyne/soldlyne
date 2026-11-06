import 'server-only'
import { revalidatePath } from 'next/cache'
import type { Prisma } from '@prisma/client'
import { currentActor, requireActor } from '@/lib/actor'
import { formatMinor } from './amounts'
import { sha256 } from '@/lib/hash'
import { canMailCustomers, mailCustomer } from '@/lib/connectors/customer-mail'
import { prisma } from '@/lib/prisma'
import { publicUrl } from '@/lib/public-url'
import { recordQuoteEvent } from './events'
import { asStoredCopy, customerCopyOf, sellerCopyOf, type CustomerCopy, type SellerCopy } from './parties'
import { lockedStatus } from './quotes'
import { quoteInclude } from './queries'
import { QuoteRefusal } from './refusal'
import { missingToSend } from './send-rules'
import { formatQuoteDate, stateOf } from './status'
import { newQuoteToken, quoteLinkPath } from './token'

type Sendable = { reference: string; currency: string; totalMinor: bigint; validUntil: Date }

/** The mail a customer gets, in plain words. Replies go to the seller, who is whom it's from. */
export function quoteMail({ reference, currency, totalMinor, validUntil }: Sendable, seller: SellerCopy, customer: CustomerCopy, url: string) {
  return {
    subject: `Quote ${reference} from ${seller.legalName}`,
    text: `Hello${customer.contactName ? ` ${customer.contactName}` : ''},\n\n${seller.legalName} sent you quote ${reference}, for ${formatMinor(totalMinor, currency)} tax included, good until ${formatQuoteDate(validUntil)}.\n\nRead it, download it as a PDF, and accept or decline it here:\n${url}\n\nThis link is for you: anyone who has it can answer the quote. For any question, reply to this message.`,
  }
}

export type SentQuote = { id: string; reference: string; mailedTo: string | null; link: string | null }

/** Whether the mail left, from the company's own Resend account. With none, the member gets the link to pass on. */
async function mailLink(row: Sendable, seller: SellerCopy, customer: CustomerCopy, url: string): Promise<boolean> {
  if (!customer.contactEmail) return false
  return mailCustomer({ to: customer.contactEmail, replyTo: seller.contactEmail, ...quoteMail(row, seller, customer, url) })
}

type Delivered = Sendable & { id: string; dealId: string | null; companyId: string | null; contactId: string | null }

/** Mails the link, records what came of it, and says the same to the member. `link` comes back only when no mail left. */
async function deliver(event: string, row: Delivered, seller: SellerCopy, customer: CustomerCopy, token: string): Promise<SentQuote> {
  const url = `${publicUrl()}${quoteLinkPath(token)}`
  const mailed = await mailLink(row, seller, customer, url)
  const mailedTo = mailed ? customer.contactEmail : null
  await recordQuoteEvent(prisma, event, row, { reference: row.reference, to: mailedTo }, currentActor())
  revalidatePath('/', 'layout')
  return { id: row.id, reference: row.reference, mailedTo, link: mailed ? null : url }
}

/** Freezes a draft as what the customer gets and sends it. Fails with a plain list of what's missing, leaving the draft as it was. */
export async function sendQuote(id: string): Promise<SentQuote> {
  await requireActor()
  const token = newQuoteToken()
  const canMail = await canMailCustomers()
  const { row, seller, customer } = await prisma.$transaction(async (tx) => {
    if ((await lockedStatus(tx, id)) !== 'DRAFT') throw new QuoteRefusal('This quote has already been sent.')
    const quote = await tx.quote.findUniqueOrThrow({ where: { id }, include: quoteInclude })
    const sellerCopy = sellerCopyOf(await tx.sellerDetails.findFirst())
    const customerCopy = customerCopyOf(quote)
    const missing = missingToSend({ seller: sellerCopy, customer: customerCopy, lineCount: quote.lines.length, validUntil: quote.validUntil }, { canMail })
    if (missing.length > 0) throw new QuoteRefusal(`It can't be sent yet. ${missing.join(' ')}`)
    const data: Prisma.QuoteUpdateInput = { status: 'SENT', sentAt: new Date(), tokenHash: sha256(token), sellerCopy: asStoredCopy(sellerCopy), customerCopy: asStoredCopy(customerCopy) }
    return { row: await tx.quote.update({ where: { id }, data }), seller: sellerCopy, customer: customerCopy }
  })
  return deliver('quote.sent', row, seller, customer, token)
}

/**
 * A new link for a quote still waiting for its answer, mailed to the same address, or shown when no
 * mail can leave: the link itself isn't kept, so this is how a lost one is replaced. The old one stops working.
 */
export async function renewQuoteLink(id: string): Promise<SentQuote> {
  await requireActor()
  const token = newQuoteToken()
  const row = await prisma.$transaction(async (tx) => {
    await lockedStatus(tx, id)
    const quote = await tx.quote.findUniqueOrThrow({ where: { id } })
    if (stateOf(quote) !== 'SENT') throw new QuoteRefusal('Only a sent quote still waiting for its answer can get a new link.')
    return tx.quote.update({ where: { id }, data: { tokenHash: sha256(token) } })
  })
  return deliver('quote.link_renewed', row, row.sellerCopy as SellerCopy, row.customerCopy as CustomerCopy, token)
}
