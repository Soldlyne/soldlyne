import type { Prisma, SellerDetails } from '@prisma/client'

/** Who a quote is from and for, as it stands on the quote. Copied when sent, so later edits to either don't change what the customer was sent. */

export type SellerCopy = { legalName: string; address: string; companyNumber: string; vatNumber: string; contactEmail: string }

export type CustomerCopy = { companyName: string; city: string; country: string; contactName: string; contactEmail: string }

type Company = { name: string; city: string | null; country: string | null }
type Contact = { firstName: string; lastName: string; emails: string[]; company?: Company | null }

export const sellerCopyOf = (seller: Partial<SellerDetails> | null): SellerCopy => ({
  legalName: seller?.legalName ?? '',
  address: seller?.address ?? '',
  companyNumber: seller?.companyNumber ?? '',
  vatNumber: seller?.vatNumber ?? '',
  contactEmail: seller?.contactEmail ?? '',
})

/** The company named on the quote, otherwise the contact's. */
export function customerCopyOf({ company, contact }: { company?: Company | null; contact?: Contact | null }): CustomerCopy {
  const named = company ?? contact?.company
  return {
    companyName: named?.name ?? '',
    city: named?.city ?? '',
    country: named?.country ?? '',
    contactName: contact ? `${contact.firstName} ${contact.lastName}`.trim() : '',
    contactEmail: contact?.emails[0] ?? '',
  }
}

export const asStoredCopy = (copy: SellerCopy | CustomerCopy) => copy as unknown as Prisma.InputJsonValue
