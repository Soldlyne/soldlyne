'use client'

import Link from 'next/link'
import type { Product } from '@prisma/client'
import { updateProduct } from '@/lib/crm/actions'
import { EditableField } from '@/components/crm/editable-field'
import { cn } from '@/lib/utils'

const KINDS = [
  ['SAAS', 'SaaS'],
  ['SERVICE', 'Service'],
  ['TRAINING', 'Training'],
  ['RECRUITMENT', 'Recruitment'],
  ['LICENSE', 'License'],
  ['ADS', 'Ads / sponsorship'],
  ['OTHER', 'Other'],
].map(([value, label]) => ({ value, label }))
const STATUSES = [
  ['LIVE', 'Live'],
  ['BETA', 'Beta'],
  ['PLANNED', 'Planned'],
].map(([value, label]) => ({ value, label }))

export function ProductCard({
  product,
  stats,
  projects,
  handle,
}: {
  product: Product
  stats: string
  projects: { value: string; label: string }[]
  /** Drag handle from the catalog editor. */
  handle?: React.ReactNode
}) {
  const save = (patch: Record<string, unknown>) => updateProduct(product.id, patch)
  return (
    <div className={cn('rounded-lg border bg-card p-4', product.archived && 'opacity-60')}>
      <div className="flex items-center gap-2">
        {handle}
        <span className="size-2.5 rounded-full" style={{ backgroundColor: product.color }} aria-hidden />
        <Link href={product.projectId ? `/pipeline/${product.projectId}?product=${product.id}` : '/pipeline'} className="font-medium hover:underline">
          {product.name}
        </Link>
        <span className="ml-auto text-xs text-muted-foreground">{STATUSES.find((s) => s.value === product.status)?.label}</span>
      </div>
      <p className="num mt-2 text-xs text-muted-foreground">{stats}</p>
      <div className="mt-3 border-t pt-2">
        <EditableField label="Pitch" field="tagline" value={product.tagline} save={save} type="textarea" />
        <EditableField label="Project" field="projectId" value={product.projectId} save={save} type="select" options={projects} />
        <EditableField label="Type" field="kind" value={product.kind} save={save} type="select" options={KINDS} />
        <EditableField label="Status" field="status" value={product.status} save={save} type="select" options={STATUSES} />
        <EditableField label="Buyer" field="buyer" value={product.buyer} save={save} />
        <EditableField label="Pricing" field="pricing" value={product.pricing} save={save} type="textarea" />
        <EditableField label="Website" field="url" value={product.url} save={save} href={product.url ?? undefined} />
      </div>
    </div>
  )
}
