import { prisma } from '@/lib/prisma'

/** Seller details that can be sent with. In the current workspace. */
export const fillSeller = (overrides: Parameters<typeof prisma.sellerDetails.create>[0]['data'] = {}) =>
  prisma.sellerDetails.create({ data: { legalName: 'Northwind Works', address: '1 Example Street\n75000 Paris', companyNumber: '123 456 789', vatNumber: 'FR00123456789', contactEmail: 'sales@northwind.example', defaultCurrency: 'EUR', defaultTaxRateMilliPercent: 20000, defaultValidityDays: 30, defaultTerms: 'Payment within 30 days.', ...overrides } })

/** An open deal with a company, a contact and a product of its own. In the current workspace. */
export async function createDealFixture(tag: string, { contactEmail = `ada@${tag}.example` }: { contactEmail?: string | null } = {}) {
  const open = (await prisma.stage.findFirst({ where: { kind: 'OPEN' } })) ?? (await prisma.stage.create({ data: { name: 'Open', kind: 'OPEN', position: 0 } }))
  const product = await prisma.product.create({ data: { name: `Product ${tag}` } })
  const company = await prisma.company.create({ data: { name: `Acme ${tag}`, domain: `${tag}.example`, city: 'Lyon', country: 'France' } })
  const contact = await prisma.person.create({ data: { firstName: 'Ada', lastName: 'Martin', emails: contactEmail ? [contactEmail] : [], companyId: company.id } })
  const deal = await prisma.deal.create({ data: { name: `Deal ${tag}`, productId: product.id, stageId: open.id, companyId: company.id, contactId: contact.id } })
  return { deal, company, contact, product, open }
}

export const TWO_RATES = [
  { description: 'Setup', quantity: 2, unitPrice: 100, taxRate: 20 },
  { description: 'Training', quantity: '1.5', unitPrice: '200.50', taxRate: '5.5', discount: 10 },
]
