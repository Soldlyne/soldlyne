import { formatQuoteDate, todayUtc } from './status'
import type { CustomerCopy, SellerCopy } from './parties'

const REQUIRED_OF_SELLER: [keyof SellerCopy, string][] = [
  ['legalName', 'legal name'],
  ['address', 'address'],
  ['companyNumber', 'company number'],
  ['contactEmail', 'contact email'],
]

/** What the seller details still lack. The VAT number isn't among them: not every seller has one, and which must is no question for Soldlyne to answer. */
export const missingOfSeller = (seller: SellerCopy) => REQUIRED_OF_SELLER.filter(([field]) => !seller[field].trim()).map(([, label]) => label)

type Draft = { seller: SellerCopy; customer: CustomerCopy; lineCount: number; validUntil: Date }

/** Everything that stops this draft from being sent, each in a sentence the person can act on. Empty when it can go. */
export function missingToSend({ seller, customer, lineCount, validUntil }: Draft, { canMail, now = new Date() }: { canMail: boolean; now?: Date }): string[] {
  const missingSeller = missingOfSeller(seller)
  return [
    missingSeller.length > 0 && `The seller details lack: ${missingSeller.join(', ')}. Owners and admins fill them in Settings.`,
    lineCount === 0 && 'The quote has no lines.',
    !customer.companyName && !customer.contactName && !customer.contactEmail && 'The quote names no customer: choose a company or a contact.',
    canMail && !customer.contactEmail && 'The quote has no address to go to: choose a contact with an email address.',
    validUntil < todayUtc(now) && `The valid-until date, ${formatQuoteDate(validUntil)}, has passed.`,
  ].filter((reason): reason is string => Boolean(reason))
}
