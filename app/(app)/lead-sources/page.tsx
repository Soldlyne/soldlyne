import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { listProducts } from '@/lib/crm/queries'
import { publicUrl } from '@/lib/public-url'
import { LeadSources } from './lead-sources'

export const metadata: Metadata = { title: 'Lead capture' }

export default async function LeadSourcesPage() {
  const [sources, products] = await Promise.all([prisma.leadSource.findMany({ orderBy: { createdAt: 'desc' }, omit: { keyHash: true } }), listProducts()])
  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 p-4 lg:p-8">
      <div>
        <h1 className="text-xl font-semibold">Lead capture</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One source per form (waitlist, beta, report download...). Each lead creates or updates the person and company, logs the form, can open a
          deal and, when the person ticked the opt-in box, records their consent.
        </p>
      </div>
      <LeadSources
        endpoint={`${publicUrl()}/api/leads`}
        sources={sources}
        products={products.map((p) => ({ id: p.id, label: p.label }))}
      />
    </div>
  )
}
