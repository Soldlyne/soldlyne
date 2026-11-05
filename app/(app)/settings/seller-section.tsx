import type { MemberRole } from '@prisma/client'
import { Panel } from '@/components/crm/record-layout'
import { PERCENT_DIGITS, shortDecimalText } from '@/lib/quotes/amounts'
import { sellerDetailsOfWorkspace } from '@/lib/quotes/queries'
import { managesSeller } from '@/lib/workspaces/roles'
import { SellerForm } from './seller-form'

/** What this workspace's quotes say about it. Its own text: Soldlyne doesn't say what the law asks of a quote. */
export async function SellerSection({ role }: { role: MemberRole }) {
  const seller = await sellerDetailsOfWorkspace()
  const mayEdit = managesSeller(role)
  return (
    <Panel title="Seller details">
      <p className="mb-3 text-sm text-muted-foreground">
        What your quotes say about you, and what a new quote starts from. It is your own text: Soldlyne doesn&apos;t check it, and doesn&apos;t say what your country asks of a quote. A quote already sent keeps what it was sent with.
        {!mayEdit && ' Only owners and admins can change these.'}
      </p>
      <SellerForm
        mayEdit={mayEdit}
        initial={{
          legalName: seller?.legalName ?? '',
          address: seller?.address ?? '',
          companyNumber: seller?.companyNumber ?? '',
          vatNumber: seller?.vatNumber ?? '',
          contactEmail: seller?.contactEmail ?? '',
          defaultCurrency: seller?.defaultCurrency ?? 'EUR',
          defaultTaxRate: shortDecimalText(BigInt(seller?.defaultTaxRateMilliPercent ?? 0), PERCENT_DIGITS),
          defaultValidityDays: String(seller?.defaultValidityDays ?? 30),
          defaultTerms: seller?.defaultTerms ?? '',
          yearlyQuoteNumbers: seller?.yearlyQuoteNumbers ?? false,
        }}
      />
    </Panel>
  )
}
