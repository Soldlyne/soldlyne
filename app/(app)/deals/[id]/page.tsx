import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { deleteDeal, updateDeal } from '@/lib/crm/actions'
import { setDealPartnerFromField as setDealPartner } from '@/lib/partners/field'
import { listProducts, tasksFor, timelineFor } from '@/lib/crm/queries'
import { CHANNELS, CHANNEL_LABELS, formatDate, formatMoney, personName } from '@/lib/crm/format'
import { EditableField } from '@/components/crm/editable-field'
import { Panel, RecordLayout, SideSection } from '@/components/crm/record-layout'
import { RecordMenu } from '@/components/crm/record-menu'
import { TaskList } from '@/components/crm/task-list'
import { ActivityComposer } from '@/components/crm/log-activity'
import { Timeline } from '@/components/crm/timeline'
import { CustomFields } from '@/components/crm/custom-fields'
import { StageBar } from '@/components/crm/stage-bar'
import { DealQuotes } from '@/components/quotes/deal-quotes'

const live = { deletedAt: null }

export async function generateMetadata({ params }: PageProps<'/deals/[id]'>): Promise<Metadata> {
  const deal = await prisma.deal.findUnique({ where: { id: (await params).id }, select: { name: true } })
  return { title: deal?.name ?? 'Deal' }
}

export default async function DealPage({ params }: PageProps<'/deals/[id]'>) {
  const { id } = await params
  const deal = await prisma.deal.findFirst({ where: { id, ...live }, include: { stage: true, product: { include: { project: true } }, company: true, contact: true } })
  if (!deal) notFound()
  const [timeline, tasks, fields, stages, products, companies, people, partners] = await Promise.all([
    timelineFor({ dealId: id }),
    tasksFor({ dealId: id }),
    prisma.customField.findMany({ where: { object: 'DEAL' }, orderBy: { position: 'asc' } }),
    prisma.stage.findMany({ orderBy: { position: 'asc' } }),
    listProducts({ includeArchived: true }),
    prisma.company.findMany({ where: live, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.person.findMany({
      where: { ...live, ...(deal.companyId ? { companyId: deal.companyId } : {}) },
      select: { id: true, firstName: true, lastName: true, emails: true },
      orderBy: { lastName: 'asc' },
      take: 500,
    }),
    prisma.partner.findMany({ where: { status: { not: 'INACTIVE' } }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ])
  const save = updateDeal.bind(null, id)
  const probability = deal.probability ?? deal.stage.probability

  return (
    <RecordLayout
      crumb={{ href: deal.product.projectId ? `/pipeline/${deal.product.projectId}` : '/pipeline', label: deal.product.project?.name ?? 'Pipeline' }}
      avatar={
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md border" aria-hidden>
          <span className="size-3 rounded-full" style={{ backgroundColor: deal.product.project?.color ?? deal.product.color }} />
        </span>
      }
      title={deal.name}
      subtitle={
        <span className="num">
          {deal.amount !== null ? formatMoney(deal.amount, deal.currency) : 'No amount'} · {probability}%
          {deal.closeDate ? ` · closes ${formatDate(deal.closeDate)}` : ''}
        </span>
      }
      actions={<RecordMenu onDelete={deleteDeal.bind(null, id)} redirectTo={deal.product.projectId ? `/pipeline/${deal.product.projectId}` : '/pipeline'} label="deal" />}
      side={
        <SideSection title="Details">
          <EditableField label="Name" field="name" value={deal.name} save={save} />
          <EditableField label="Product" field="productId" value={deal.productId} save={save} type="select" options={products.map((p) => ({ value: p.id, label: p.label }))} />
          <EditableField label="Stage" field="stageId" value={deal.stageId} save={save} type="select" options={stages.map((s) => ({ value: s.id, label: s.name }))} />
          <EditableField
            label="Company"
            field="companyId"
            value={deal.companyId}
            save={save}
            type="select"
            options={companies.map((company) => ({ value: company.id, label: company.name }))}
            href={deal.companyId ? `/companies/${deal.companyId}` : undefined}
          />
          <EditableField
            label="Contact"
            field="contactId"
            value={deal.contactId}
            save={save}
            type="select"
            options={people.map((person) => ({ value: person.id, label: personName(person) }))}
            href={deal.contactId ? `/people/${deal.contactId}` : undefined}
          />
          <EditableField
            label="Amount"
            field="amount"
            value={deal.amount !== null ? String(Number(deal.amount) / 100) : null}
            display={deal.amount !== null ? formatMoney(deal.amount, deal.currency) : undefined}
            save={save}
          />
          <EditableField label="Close date" field="closeDate" value={deal.closeDate?.toISOString().slice(0, 10)} display={formatDate(deal.closeDate)} save={save} type="date" />
          <EditableField
            label="Referred by"
            field="partnerId"
            value={deal.partnerId}
            save={setDealPartner.bind(null, id)}
            type="select"
            options={partners.map((p) => ({ value: p.id, label: p.name }))}
            href={deal.partnerId ? '/partners' : undefined}
            placeholder="Nobody"
          />
          <EditableField
            label="Source"
            field="source"
            value={deal.source}
            save={save}
            type="select"
            options={CHANNELS.map((value) => ({ value, label: CHANNEL_LABELS[value] }))}
          />
          {deal.stage.kind === 'LOST' && <EditableField label="Lost reason" field="lostReason" value={deal.lostReason} save={save} type="textarea" />}
          <CustomFields fields={fields} values={deal.custom} save={save} />
        </SideSection>
      }
    >
      <StageBar stages={stages} current={deal.stageId} save={save} />
      <Panel title="Next steps">
        <TaskList tasks={tasks} target={{ dealId: id }} />
      </Panel>
      <DealQuotes dealId={id} />
      <ActivityComposer dealId={id} companyId={deal.companyId} people={people} personIds={deal.contactId ? [deal.contactId] : []} />
      <Timeline entries={timeline} emptyHint="No interaction on this deal yet." />
    </RecordLayout>
  )
}
