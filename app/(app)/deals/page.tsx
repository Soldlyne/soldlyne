import type { Metadata } from 'next'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { listDeals, listProducts, listStages } from '@/lib/crm/queries'
import { dealWhere, type Params } from '@/lib/crm/list-filters'
import { now } from '@/lib/crm/format'
import { CONTACT_OPTIONS, FilterBar } from '@/components/lists/filter-bar'
import { AllCheck, RowCheck, SelectionProvider } from '@/components/lists/selection'
import { BulkBar } from '@/components/lists/bulk-bar'
import { formatDate, formatDue, formatMoney, formatRelative, personName } from '@/lib/crm/format'
import { EmptyState, ListHeader, RowLink, Td, Th } from '@/components/crm/list-page'
import { NewDealButton } from '@/components/crm/create-dialogs'

export const metadata: Metadata = { title: 'Deals' }

export default async function DealsPage({ searchParams }: PageProps<'/deals'>) {
  const params = (await searchParams) as Params
  const q = params.q?.toString()
  const [deals, products, stages, views, projects] = await Promise.all([
    listDeals({ where: dealWhere(params, now()) }),
    listProducts(),
    listStages(),
    prisma.view.findMany({ where: { object: 'DEAL' }, orderBy: { position: 'asc' } }),
    prisma.project.findMany({ where: { archived: false }, orderBy: { position: 'asc' } }),
  ])
  return (
    <SelectionProvider>
      <ListHeader title="Deals" count={deals.length} search={false} actions={<NewDealButton products={products} />} />
      <FilterBar
        object="DEAL"
        placeholder="Deal or company..."
        views={views.map((v) => ({ id: v.id, name: v.name, query: (v.filters as { query?: string }).query ?? '' }))}
        facets={[
          { key: 'project', label: 'Project', options: projects.map((p) => ({ value: p.id, label: p.name })) },
          { key: 'stage', label: 'Stage', options: [{ value: 'open', label: 'All open' }, ...stages.map((s) => ({ value: s.id, label: s.name }))] },
          { key: 'next', label: 'Next step', options: [{ value: 'none', label: 'No next step' }, { value: 'due', label: 'Due or overdue' }] },
          { key: 'stale', label: 'Stuck', options: [{ value: 'yes', label: '14+ days in stage' }] },
          { key: 'nocontact', label: 'Contact', options: [{ value: 'yes', label: 'No contact person' }] },
          { key: 'contact', label: 'Last contact', options: CONTACT_OPTIONS },
        ]}
      />
      {deals.length === 0 ? (
        <EmptyState title={q ? 'No match' : 'No deals yet'} hint={q ? 'Try another search.' : 'Open a deal for one of your products.'} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <Th className="w-8 pl-4 lg:pl-6">
                  <AllCheck ids={deals.map((d) => d.id)} />
                </Th>
                <Th>Deal</Th>
                <Th>Product</Th>
                <Th>Stage</Th>
                <Th className="text-right">Amount</Th>
                <Th>Company</Th>
                <Th>Contact</Th>
                <Th>Close</Th>
                <Th>Last contact</Th>
                <Th>Next step</Th>
              </tr>
            </thead>
            <tbody>
              {deals.map((deal) => {
                const next = deal.tasks[0]
                const last = deal.activities[0]
                return (
                  <tr key={deal.id} className="hover:bg-accent/40">
                    <Td className="pl-4 lg:pl-6">
                      <RowCheck id={deal.id} />
                    </Td>
                    <Td>
                      <RowLink href={`/deals/${deal.id}`}>{deal.name}</RowLink>
                    </Td>
                    <Td>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="size-2 rounded-full" style={{ backgroundColor: deal.product.color }} aria-hidden />
                        {deal.product.name}
                      </span>
                    </Td>
                    <Td>{deal.stage.name}</Td>
                    <Td className="num text-right">{formatMoney(deal.amount, deal.currency)}</Td>
                    <Td>{deal.company && <Link href={`/companies/${deal.company.id}`} className="hover:underline">{deal.company.name}</Link>}</Td>
                    <Td className="text-muted-foreground">{deal.contact && personName(deal.contact)}</Td>
                    <Td className="text-muted-foreground">{formatDate(deal.closeDate)}</Td>
                    <Td className="text-muted-foreground">{last ? formatRelative(last.occurredAt) : ''}</Td>
                    <Td className="max-w-64 truncate">{next ? `${formatDue(next.dueAt)} · ${next.title}` : deal.stage.kind === 'OPEN' ? <span className="text-warning">None</span> : ''}</Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <BulkBar object="DEAL" stages={stages.map((s) => ({ id: s.id, name: s.name }))} />
    </SelectionProvider>
  )
}
