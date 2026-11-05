import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Mail, Phone } from 'lucide-react'
import { LinkedinIcon } from '@/components/crm/icons'
import { prisma } from '@/lib/prisma'
import { deletePerson, updatePerson } from '@/lib/crm/actions'
import { listProducts, tasksFor, timelineFor } from '@/lib/crm/queries'
import { CHANNELS, CHANNEL_LABELS, formatDate, formatMoney, personName } from '@/lib/crm/format'
import { EditableField } from '@/components/crm/editable-field'
import { Monogram, Panel, RecordLayout, SideSection } from '@/components/crm/record-layout'
import { RecordMenu } from '@/components/crm/record-menu'
import { TaskList } from '@/components/crm/task-list'
import { ActivityComposer } from '@/components/crm/log-activity'
import { Timeline } from '@/components/crm/timeline'
import { NewDealButton } from '@/components/crm/create-dialogs'
import { CustomFields } from '@/components/crm/custom-fields'
import { Button } from '@/components/ui/button'

const live = { deletedAt: null }

export async function generateMetadata({ params }: PageProps<'/people/[id]'>): Promise<Metadata> {
  const person = await prisma.person.findUnique({ where: { id: (await params).id } })
  return { title: person ? personName(person) : 'Person' }
}

export default async function PersonPage({ params }: PageProps<'/people/[id]'>) {
  const { id } = await params
  const person = await prisma.person.findFirst({
    where: { id, ...live },
    include: {
      company: true,
      contactFor: { where: live, include: { stage: true, product: true }, orderBy: { updatedAt: 'desc' } },
    },
  })
  if (!person) notFound()
  const [timeline, tasks, fields, companies, products] = await Promise.all([
    timelineFor({ personId: id }),
    tasksFor({ personId: id }),
    prisma.customField.findMany({ where: { object: 'PERSON' }, orderBy: { position: 'asc' } }),
    prisma.company.findMany({ where: live, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    listProducts(),
  ])
  const save = updatePerson.bind(null, id)
  const name = personName(person)
  const email = person.emails[0]
  const phone = person.phones[0]

  return (
    <RecordLayout
      crumb={{ href: '/people', label: 'People' }}
      avatar={<Monogram label={name} />}
      title={name}
      subtitle={
        <>
          {person.jobTitle}
          {person.jobTitle && person.company ? ' at ' : ''}
          {person.company && (
            <Link href={`/companies/${person.company.id}`} className="hover:text-foreground hover:underline">
              {person.company.name}
            </Link>
          )}
        </>
      }
      actions={<RecordMenu onDelete={deletePerson.bind(null, id)} redirectTo="/people" label="person" />}
      side={
        <>
          <div className="flex gap-1">
            {email && (
              <Button variant="outline" size="sm" asChild>
                <a href={`mailto:${email}`}>
                  <Mail /> Email
                </a>
              </Button>
            )}
            {phone && (
              <Button variant="outline" size="sm" asChild>
                <a href={`tel:${phone.replace(/\s/g, '')}`}>
                  <Phone /> Call
                </a>
              </Button>
            )}
            {person.linkedinUrl && (
              <Button variant="outline" size="sm" asChild>
                <a href={person.linkedinUrl} target="_blank" rel="noreferrer">
                  <LinkedinIcon /> LinkedIn
                </a>
              </Button>
            )}
          </div>
          <SideSection title="Details">
            <EditableField label="First name" field="firstName" value={person.firstName} save={save} />
            <EditableField label="Last name" field="lastName" value={person.lastName} save={save} />
            <EditableField label="Job title" field="jobTitle" value={person.jobTitle} save={save} />
            <EditableField
              label="Company"
              field="companyId"
              value={person.companyId}
              save={save}
              type="select"
              options={companies.map((company) => ({ value: company.id, label: company.name }))}
              href={person.companyId ? `/companies/${person.companyId}` : undefined}
            />
            <EditableField label="Emails" field="emails" value={person.emails.join(', ')} save={save} type="list" />
            <EditableField label="Phones" field="phones" value={person.phones.join(', ')} save={save} type="list" />
            <EditableField label="LinkedIn" field="linkedinUrl" value={person.linkedinUrl} save={save} href={person.linkedinUrl ?? undefined} />
            <EditableField label="City" field="city" value={person.city} save={save} />
            <EditableField
              label="Source"
              field="source"
              value={person.source}
              save={save}
              type="select"
              options={CHANNELS.map((value) => ({ value, label: CHANNEL_LABELS[value] }))}
            />
            <EditableField
              label="Opt-in"
              field="consentAt"
              value={person.consentAt?.toISOString().slice(0, 10)}
              display={person.consentAt ? `${formatDate(person.consentAt)}${person.consentSource ? ` · ${person.consentSource}` : ''}` : undefined}
              save={save}
              type="date"
              placeholder="No opt-in"
            />
            <EditableField label="Opt-in source" field="consentSource" value={person.consentSource} save={save} placeholder="Form, event, customer..." />
            <CustomFields fields={fields} values={person.custom} save={save} />
          </SideSection>
          <SideSection
            title={`Deals · ${person.contactFor.length}`}
            action={<NewDealButton products={products} contactId={id} companyId={person.companyId ?? undefined} defaultName={person.company?.name} size="xs" />}
          >
            {person.contactFor.length === 0 && <p className="px-2 text-sm text-muted-foreground">Not the contact of any deal.</p>}
            {person.contactFor.map((deal) => (
              <Link key={deal.id} href={`/deals/${deal.id}`} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent">
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: deal.product.color }} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm">{deal.name}</span>
                <span className="text-xs text-muted-foreground">{deal.stage.name}</span>
                {deal.amount !== null && <span className="num text-xs">{formatMoney(deal.amount, deal.currency)}</span>}
              </Link>
            ))}
          </SideSection>
        </>
      }
    >
      <Panel title="Next steps">
        <TaskList tasks={tasks} target={{ personId: id }} />
      </Panel>
      <ActivityComposer personIds={[id]} companyId={person.companyId} dealId={person.contactFor.length === 1 ? person.contactFor[0].id : null} />
      <Timeline entries={timeline} emptyHint="No interaction with this person yet." />
    </RecordLayout>
  )
}
