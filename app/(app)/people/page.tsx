import type { Metadata } from 'next'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { listPeople } from '@/lib/crm/queries'
import { personWhere, type Params } from '@/lib/crm/list-filters'
import { now } from '@/lib/crm/format'
import { CONTACT_OPTIONS, FilterBar } from '@/components/lists/filter-bar'
import { AllCheck, RowCheck, SelectionProvider } from '@/components/lists/selection'
import { BulkBar } from '@/components/lists/bulk-bar'
import { ACTIVITY_LABELS, formatRelative, personName } from '@/lib/crm/format'
import { EmptyState, ListHeader, RowLink, Td, Th } from '@/components/crm/list-page'
import { NewPersonButton } from '@/components/crm/create-dialogs'
import { Monogram } from '@/components/crm/record-layout'

export const metadata: Metadata = { title: 'People' }

export default async function PeoplePage({ searchParams }: PageProps<'/people'>) {
  const params = (await searchParams) as Params
  const q = params.q?.toString()
  const [people, views, projects] = await Promise.all([
    listPeople(personWhere(params, now())),
    prisma.view.findMany({ where: { object: 'PERSON' }, orderBy: { position: 'asc' } }),
    prisma.project.findMany({ where: { archived: false }, orderBy: { position: 'asc' } }),
  ])
  return (
    <SelectionProvider>
      <ListHeader title="People" count={people.length} search={false} actions={<NewPersonButton />} />
      <FilterBar
        object="PERSON"
        placeholder="Name, email, company..."
        views={views.map((v) => ({ id: v.id, name: v.name, query: (v.filters as { query?: string }).query ?? '' }))}
        facets={[
          { key: 'email', label: 'Email', options: [{ value: 'yes', label: 'Has email' }, { value: 'no', label: 'No email' }] },
          { key: 'optin', label: 'Opt-in', options: [{ value: 'yes', label: 'Opted in' }, { value: 'no', label: 'No opt-in' }] },
          { key: 'priority', label: 'Company priority', options: ['A', 'B', 'C'].map((p) => ({ value: p, label: `Priority ${p}` })) },
          { key: 'project', label: 'Open deal in', options: projects.map((p) => ({ value: p.id, label: p.name })) },
          { key: 'contact', label: 'Last contact', options: CONTACT_OPTIONS },
        ]}
      />
      {people.length === 0 ? (
        <EmptyState title={q ? 'No match' : 'No people yet'} hint={q ? 'Try another search.' : 'Add a contact, or import a CSV.'} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <Th className="w-8 pl-4 lg:pl-6">
                  <AllCheck ids={people.map((p) => p.id)} />
                </Th>
                <Th>Name</Th>
                <Th>Job title</Th>
                <Th>Company</Th>
                <Th>Email</Th>
                <Th>Phone</Th>
                <Th>Last contact</Th>
              </tr>
            </thead>
            <tbody>
              {people.map((person) => {
                const last = person.participants[0]?.activity
                return (
                  <tr key={person.id} className="hover:bg-accent/40">
                    <Td className="pl-4 lg:pl-6">
                      <RowCheck id={person.id} />
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Monogram label={personName(person)} size="sm" />
                        <RowLink href={`/people/${person.id}`}>{personName(person)}</RowLink>
                      </div>
                    </Td>
                    <Td className="max-w-56 truncate text-muted-foreground">{person.jobTitle}</Td>
                    <Td>
                      {person.company && (
                        <Link href={`/companies/${person.company.id}`} className="hover:underline">
                          {person.company.name}
                        </Link>
                      )}
                    </Td>
                    <Td className="text-muted-foreground">{person.emails[0]}</Td>
                    <Td className="text-muted-foreground">{person.phones[0]}</Td>
                    <Td className="text-muted-foreground">{last ? `${ACTIVITY_LABELS[last.type]} · ${formatRelative(last.occurredAt)}` : ''}</Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <BulkBar object="PERSON" />
    </SelectionProvider>
  )
}
