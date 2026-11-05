'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, Trash2 } from 'lucide-react'
import type { PartnerRow } from '@/lib/partners/queries'
import { createPartner, deletePartner, setCommissionPaid, updatePartner } from '@/lib/partners/actions'
import { formatMoney } from '@/lib/crm/format'
import { EditableField } from '@/components/crm/editable-field'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { useRun } from '@/hooks/ui/use-run'

export const PARTNER_TYPES = [
  ['ACCOUNTANT', 'Accountant'],
  ['MSP', 'MSP / IT provider'],
  ['LAWYER', 'Lawyer'],
  ['INSURER', 'Insurer / broker'],
  ['CONSULTANT', 'Consultant (NIS2, ISO)'],
  ['INVESTOR', 'Investor / VC'],
  ['OTHER', 'Other'],
].map(([value, label]) => ({ value, label }))

const STATUSES = [
  ['PROSPECT', 'Prospect'],
  ['ACTIVE', 'Active'],
  ['INACTIVE', 'Inactive'],
].map(([value, label]) => ({ value, label }))

export function NewPartnerForm() {
  const [name, setName] = useState('')
  const { pending, run } = useRun()
  return (
    <form
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        run(() => createPartner({ name }), () => setName(''))
      }}
    >
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New partner, e.g. an accounting firm" className="h-9 flex-1" />
      <Button type="submit" loading={pending} disabled={!name.trim()}>
        <Plus /> Add partner
      </Button>
    </form>
  )
}

export function PartnerCard({ partner, companies }: { partner: PartnerRow; companies: { id: string; name: string }[] }) {
  const { run } = useRun()
  const save = (patch: Record<string, unknown>) => updatePartner(partner.id, patch)
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-medium">{partner.name}</span>
        <span className="text-xs text-muted-foreground">
          {PARTNER_TYPES.find((t) => t.value === partner.type)?.label} · {STATUSES.find((s) => s.value === partner.status)?.label}
        </span>
        <span className="num ml-auto text-xs text-muted-foreground">
          {partner.referred} referred · {partner.won} won · {formatMoney(partner.wonValue)} · owed {formatMoney(partner.owed)}
        </span>
        <Button variant="ghost" size="icon-xs" onClick={() => confirm(`Delete ${partner.name}?`) && run(() => deletePartner(partner.id))} aria-label="Delete partner">
          <Trash2 />
        </Button>
      </div>
      <div className="mt-2 grid gap-x-8 md:grid-cols-2">
        <EditableField label="Name" field="name" value={partner.name} save={save} />
        <EditableField label="Type" field="type" value={partner.type} save={save} type="select" options={PARTNER_TYPES} />
        <EditableField label="Status" field="status" value={partner.status} save={save} type="select" options={STATUSES} />
        <EditableField label="Commission %" field="commissionPct" value={String(partner.commissionPct)} save={save} parse={(v) => Number(v)} />
        <EditableField
          label="Company"
          field="companyId"
          value={partner.companyId}
          save={save}
          type="select"
          options={companies.map((c) => ({ value: c.id, label: c.name }))}
          href={partner.companyId ? `/companies/${partner.companyId}` : undefined}
        />
        <EditableField label="Notes" field="notes" value={partner.notes} save={save} type="textarea" />
      </div>
      {partner.deals.length > 0 && (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="pb-1 font-medium">Deal</th>
              <th className="pb-1 font-medium">Stage</th>
              <th className="pb-1 text-right font-medium">Amount</th>
              <th className="pb-1 text-right font-medium">Commission</th>
              <th className="pb-1 text-right font-medium">Paid</th>
            </tr>
          </thead>
          <tbody>
            {partner.deals.map((deal) => (
              <tr key={deal.id} className="border-t">
                <td className="py-1.5">
                  <Link href={`/deals/${deal.id}`} className="hover:underline">
                    {deal.name}
                  </Link>
                </td>
                <td className="py-1.5 text-muted-foreground">{deal.stage.name}</td>
                <td className="num py-1.5 text-right">{formatMoney(deal.amount)}</td>
                <td className="num py-1.5 text-right">{formatMoney(Math.round((Number(deal.amount ?? 0) * partner.commissionPct) / 100))}</td>
                <td className="py-1.5 text-right">
                  {deal.stage.kind === 'WON' && (
                    <Checkbox checked={Boolean(deal.commissionPaidAt)} onCheckedChange={(checked) => run(() => setCommissionPaid(deal.id, checked === true))} aria-label="Commission paid" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
