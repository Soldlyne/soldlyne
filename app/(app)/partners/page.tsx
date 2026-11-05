import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { partnersWithStats } from '@/lib/partners/queries'
import { formatMoney } from '@/lib/crm/format'
import { PartnerCard, NewPartnerForm } from './partner-card'

export const metadata: Metadata = { title: 'Partners' }

export default async function PartnersPage() {
  const [partners, companies] = await Promise.all([
    partnersWithStats(),
    prisma.company.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ])
  const owed = partners.reduce((s, p) => s + p.owed, 0)
  const wonValue = partners.reduce((s, p) => s + p.wonValue, 0)
  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 p-4 lg:p-8">
      <div>
        <h1 className="text-xl font-semibold">Partners</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Accountants, MSPs, lawyers, brokers: people who send you clients. Set &ldquo;Referred by&rdquo; on a deal; commissions are counted on won deals.
        </p>
      </div>
      <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border">
        {[
          ['Active partners', String(partners.filter((p) => p.status === 'ACTIVE').length)],
          ['Won through partners', formatMoney(wonValue)],
          ['Commission owed', formatMoney(owed)],
        ].map(([label, value]) => (
          <div key={label} className="bg-card p-4">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="num mt-1 text-lg font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      <NewPartnerForm />
      <div className="space-y-4">
        {partners.map((partner) => (
          <PartnerCard key={partner.id} partner={partner} companies={companies} />
        ))}
      </div>
    </div>
  )
}
