import type { Metadata } from 'next'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { listCompanies } from '@/lib/crm/queries'
import { companyWhere, type Params } from '@/lib/crm/list-filters'
import { now } from '@/lib/crm/format'
import { CONTACT_OPTIONS, FilterBar } from '@/components/lists/filter-bar'
import { AllCheck, RowCheck, SelectionProvider } from '@/components/lists/selection'
import { BulkBar } from '@/components/lists/bulk-bar'
import { ACTIVITY_LABELS, formatDue, formatRelative } from '@/lib/crm/format'
import { EmptyState, ListHeader, RowLink, Td, Th } from '@/components/crm/list-page'
import { NewCompanyButton } from '@/components/crm/create-dialogs'
import { Monogram } from '@/components/crm/record-layout'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = { title: 'Companies' }

export default async function CompaniesPage({ searchParams }: PageProps<'/companies'>) {
  const params = (await searchParams) as Params
  const q = params.q?.toString()
  const [companies, views, projects] = await Promise.all([
    listCompanies(companyWhere(params, now())),
    prisma.view.findMany({ where: { object: 'COMPANY' }, orderBy: { position: 'asc' } }),
    prisma.project.findMany({ where: { archived: false }, orderBy: { position: 'asc' } }),
  ])
  return (
    <SelectionProvider>
      <ListHeader title="Companies" count={companies.length} search={false} actions={<NewCompanyButton />} />
      <FilterBar
        object="COMPANY"
        placeholder="Name, domain, city..."
        views={views.map((v) => ({ id: v.id, name: v.name, query: (v.filters as { query?: string }).query ?? '' }))}
        facets={[
          { key: 'priority', label: 'Priority', options: [...['A', 'B', 'C'].map((p) => ({ value: p, label: `Priority ${p}` })), { value: 'none', label: 'No priority' }] },
          { key: 'project', label: 'Open deal in', options: projects.map((p) => ({ value: p.id, label: p.name })) },
          { key: 'deal', label: 'Deals', options: [{ value: 'open', label: 'Has an open deal' }, { value: 'won', label: 'Customer (won)' }, { value: 'none', label: 'No deal' }] },
          { key: 'people', label: 'Contacts', options: [{ value: 'none', label: 'No contact yet' }, { value: 'some', label: 'Has contacts' }] },
          { key: 'contact', label: 'Last contact', options: CONTACT_OPTIONS },
        ]}
      />
      {companies.length === 0 ? (
        <EmptyState
          title={q ? 'No match' : 'No companies yet'}
          hint={q ? 'Try another search.' : 'Add one, or import a CSV of prospects.'}
          action={!q && (
            <Button variant="outline" size="sm" asChild>
              <Link href="/import">Import a CSV</Link>
            </Button>
          )}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <Th className="w-8 pl-4 lg:pl-6">
                  <AllCheck ids={companies.map((c) => c.id)} />
                </Th>
                <Th>Name</Th>
                <Th>Domain</Th>
                <Th>Priority</Th>
                <Th>City</Th>
                <Th className="text-right">People</Th>
                <Th className="text-right">Deals</Th>
                <Th>Last contact</Th>
                <Th>Next step</Th>
              </tr>
            </thead>
            <tbody>
              {companies.map((company) => {
                const last = company.activities[0]
                const next = company.tasks[0]
                const overdue = next?.dueAt && new Date(next.dueAt) < new Date(new Date().toDateString())
                return (
                  <tr key={company.id} className="hover:bg-accent/40">
                    <Td className="pl-4 lg:pl-6">
                      <RowCheck id={company.id} />
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Monogram label={company.name} square size="sm" />
                        <RowLink href={`/companies/${company.id}`}>{company.name}</RowLink>
                      </div>
                    </Td>
                    <Td className="text-muted-foreground">{company.domain}</Td>
                    <Td>{company.priority}</Td>
                    <Td className="text-muted-foreground">{company.city}</Td>
                    <Td className="num text-right">{company._count.people || ''}</Td>
                    <Td className="num text-right">{company._count.deals || ''}</Td>
                    <Td className="text-muted-foreground">{last ? `${ACTIVITY_LABELS[last.type]} · ${formatRelative(last.occurredAt)}` : ''}</Td>
                    <Td className="max-w-64 truncate">
                      {next && (
                        <>
                          <span className={overdue ? 'text-destructive' : ''}>{formatDue(next.dueAt)}</span> <span className="text-muted-foreground">{next.title}</span>
                        </>
                      )}
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <BulkBar object="COMPANY" />
    </SelectionProvider>
  )
}
