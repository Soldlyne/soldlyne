import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { deleteCompany, updateCompany } from '@/lib/crm/actions'
import { listProducts, tasksFor, timelineFor } from '@/lib/crm/queries'
import { CHANNELS, CHANNEL_LABELS, formatMoney, personName } from '@/lib/crm/format'
import { EditableField } from '@/components/crm/editable-field'
import { Monogram, Panel, RecordLayout, SideSection } from '@/components/crm/record-layout'
import { RecordMenu } from '@/components/crm/record-menu'
import { TaskList } from '@/components/crm/task-list'
import { ActivityComposer } from '@/components/crm/log-activity'
import { Timeline } from '@/components/crm/timeline'
import { NewPersonButton } from '@/components/crm/create-dialogs'
import { NewDealButton } from '@/components/crm/create-dialogs'
import { CustomFields } from '@/components/crm/custom-fields'

const live = { deletedAt: null }

async function load(id: string) {
  return prisma.company.findFirst({
    where: { id, ...live },
    include: {
      people: { where: live, orderBy: { lastName: 'asc' } },
      deals: { where: live, include: { stage: true, product: true }, orderBy: { updatedAt: 'desc' } },
    },
  })
}

export async function generateMetadata({ params }: PageProps<'/companies/[id]'>): Promise<Metadata> {
  const company = await prisma.company.findUnique({ where: { id: (await params).id }, select: { name: true } })
  return { title: company?.name ?? 'Company' }
}

export default async function CompanyPage({ params }: PageProps<'/companies/[id]'>) {
  const { id } = await params
  const company = await load(id)
  if (!company) notFound()
  const [timeline, tasks, fields, products] = await Promise.all([
    timelineFor({ companyId: id }),
    tasksFor({ companyId: id }),
    prisma.customField.findMany({ where: { object: 'COMPANY' }, orderBy: { position: 'asc' } }),
    listProducts(),
  ])
  const save = updateCompany.bind(null, id)

  return (
    <RecordLayout
      crumb={{ href: '/companies', label: 'Companies' }}
      avatar={<Monogram label={company.name} square />}
      title={company.name}
      subtitle={
        company.domain ? (
          <a href={`https://${company.domain}`} target="_blank" rel="noreferrer" className="hover:text-foreground hover:underline">
            {company.domain}
          </a>
        ) : null
      }
      actions={<RecordMenu onDelete={deleteCompany.bind(null, id)} redirectTo="/companies" label="company" />}
      side={
        <>
          <SideSection title="Details">
            <EditableField label="Name" field="name" value={company.name} save={save} />
            <EditableField label="Domain" field="domain" value={company.domain} save={save} placeholder="acme.com" href={company.domain ? `https://${company.domain}` : undefined} />
            <EditableField label="LinkedIn" field="linkedinUrl" value={company.linkedinUrl} save={save} href={company.linkedinUrl ?? undefined} />
            <EditableField label="Industry" field="industry" value={company.industry} save={save} />
            <EditableField label="Size" field="size" value={company.size} save={save} />
            <EditableField label="City" field="city" value={company.city} save={save} />
            <EditableField label="Country" field="country" value={company.country} save={save} />
            <EditableField
              label="Priority"
              field="priority"
              value={company.priority}
              save={save}
              type="select"
              options={['A', 'B', 'C'].map((value) => ({ value, label: value }))}
            />
            <EditableField
              label="Source"
              field="source"
              value={company.source}
              save={save}
              type="select"
              options={CHANNELS.map((value) => ({ value, label: CHANNEL_LABELS[value] }))}
            />
            <EditableField label="About" field="description" value={company.description} save={save} type="textarea" />
            <CustomFields fields={fields} values={company.custom} save={save} />
          </SideSection>
          <SideSection title={`People · ${company.people.length}`} action={<NewPersonButton companyId={id} size="xs" />}>
            {company.people.length === 0 && <p className="px-2 text-sm text-muted-foreground">No one yet.</p>}
            {company.people.map((person) => (
              <Link key={person.id} href={`/people/${person.id}`} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent">
                <Monogram label={personName(person)} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm">{personName(person)}</span>
                <span className="truncate text-xs text-muted-foreground">{person.jobTitle}</span>
              </Link>
            ))}
          </SideSection>
          <SideSection title={`Deals · ${company.deals.length}`} action={<NewDealButton companyId={id} products={products} size="xs" />}>
            {company.deals.length === 0 && <p className="px-2 text-sm text-muted-foreground">No deal yet.</p>}
            {company.deals.map((deal) => (
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
        <TaskList tasks={tasks} target={{ companyId: id }} />
      </Panel>
      <ActivityComposer companyId={id} people={company.people} />
      <Timeline entries={timeline} emptyHint="Log a call, an email or a LinkedIn message to start the history." />
    </RecordLayout>
  )
}
