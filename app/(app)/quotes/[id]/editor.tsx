'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useRun } from '@/hooks/ui/use-run'
import { saveDraft } from '@/lib/quotes/actions'
import { formatMinor, formatPercent, isKnownCurrency } from '@/lib/quotes/amounts'
import { parseLines, type LineAsText } from '@/lib/quotes/lines'
import { QuoteRefusal } from '@/lib/quotes/refusal'
import { quoteTotals, type QuoteTotals } from '@/lib/quotes/totals'
import { useDesk } from './desk'

type Option = { value: string; label: string }
type Product = Option & { pricing: string | null }

export type DraftFields = { companyId: string; contactId: string; currency: string; issueDate: string; validUntil: string; notes: string; terms: string }

type EditedLine = LineAsText & { key: number }

const withoutKey = ({ description, productId, quantity, unitPrice, taxRate, discount }: EditedLine): LineAsText => ({ description, productId, quantity, unitPrice, taxRate, discount })

const SELECT = 'h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm'
const SMALL_NUMBER = 'h-8 w-20 text-right'

/** The same reading and the same sums as saving, so what's shown is what gets stored. A description not typed yet doesn't stop the sums. */
function liveTotals(lines: EditedLine[], currency: string): { totals: QuoteTotals } | { error: string } {
  if (!isKnownCurrency(currency)) return { error: `${currency} isn't a currency code.` }
  try {
    return { totals: quoteTotals(parseLines(lines.map((line) => ({ ...line, description: line.description || '-' })), currency)) }
  } catch (error) {
    if (error instanceof QuoteRefusal) return { error: error.message }
    throw error
  }
}

function SelectField({ label, value, options, onChange, empty }: { label: string; value: string; options: Option[]; onChange: (value: string) => void; empty: string }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label>{label}</Label>
      <select aria-label={label} className={SELECT} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{empty}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label>{label}</Label>
      <Input aria-label={label} {...props} />
    </div>
  )
}

function LineRow({ line, index, net, currency, products, onChange, onRemove }: { line: EditedLine; index: number; net: bigint | undefined; currency: string; products: Product[]; onChange: (patch: Partial<EditedLine>) => void; onRemove: () => void }) {
  const product = products.find(({ value }) => value === line.productId)
  const pick = (productId: string) => {
    const picked = products.find(({ value }) => value === productId)
    onChange({ productId: productId || null, description: picked && !line.description.trim() ? picked.label : line.description })
  }
  const label = (name: string) => `Line ${index + 1} ${name}`
  return (
    <div className="space-y-2 px-3 py-3" data-testid="quote-line">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label={label('product')} className={`${SELECT} h-8 max-w-56`} value={line.productId ?? ''} onChange={(event) => pick(event.target.value)}>
          <option value="">No product</option>
          {products.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {product?.pricing && <span className="text-xs text-muted-foreground">Listed at {product.pricing}</span>}
        <span className="num ml-auto text-sm" data-testid="line-net">
          {net === undefined ? '' : formatMinor(net, currency)}
        </span>
        <Button variant="ghost" size="icon-xs" aria-label={`Remove line ${index + 1}`} onClick={onRemove}>
          <Trash2 />
        </Button>
      </div>
      <Textarea aria-label={label('description')} className="min-h-9" rows={1} placeholder="Description" value={line.description} onChange={(event) => onChange({ description: event.target.value })} />
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <label className="flex items-center gap-1.5">
          Quantity
          <Input aria-label={label('quantity')} inputMode="decimal" className={SMALL_NUMBER} value={line.quantity} onChange={(event) => onChange({ quantity: event.target.value })} />
        </label>
        <label className="flex items-center gap-1.5">
          Unit price
          <Input aria-label={label('unit price')} inputMode="decimal" className="h-8 w-28 text-right" value={line.unitPrice} onChange={(event) => onChange({ unitPrice: event.target.value })} />
        </label>
        <label className="flex items-center gap-1.5">
          Tax %
          <Input aria-label={label('tax rate')} inputMode="decimal" className={SMALL_NUMBER} value={line.taxRate} onChange={(event) => onChange({ taxRate: event.target.value })} />
        </label>
        <label className="flex items-center gap-1.5">
          Discount %
          <Input aria-label={label('discount')} inputMode="decimal" className={SMALL_NUMBER} placeholder="None" value={line.discount} onChange={(event) => onChange({ discount: event.target.value })} />
        </label>
      </div>
    </div>
  )
}

function LiveTotals({ live, currency }: { live: ReturnType<typeof liveTotals>; currency: string }) {
  if ('error' in live) {
    return (
      <p role="status" className="ml-auto max-w-sm text-sm text-destructive" data-testid="live-error">
        {live.error}
      </p>
    )
  }
  const { subtotalMinor, taxes, totalMinor } = live.totals
  const row = (label: string, amount: bigint, strong = false) => (
    <div key={label} className={`flex justify-between gap-4 ${strong ? 'border-t pt-1 font-semibold' : ''}`}>
      <dt className={strong ? '' : 'text-muted-foreground'}>{label}</dt>
      <dd className="num">{formatMinor(amount, currency)}</dd>
    </div>
  )
  return (
    <dl className="ml-auto w-full max-w-sm space-y-1 text-sm" data-testid="live-totals">
      {row('Subtotal', subtotalMinor)}
      {taxes.map((tax) => row(`Tax ${formatPercent(tax.rateMilliPercent)} on ${formatMinor(tax.baseMinor, currency)}`, tax.taxMinor))}
      {row('Total', totalMinor, true)}
    </dl>
  )
}

function PartiesAndDates({ fields, set, companies, people }: { fields: DraftFields; set: (patch: Partial<DraftFields>) => void; companies: Option[]; people: Option[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <SelectField label="Company" value={fields.companyId} options={companies} empty="No company" onChange={(companyId) => set({ companyId })} />
      <SelectField label="Contact" value={fields.contactId} options={people} empty="No contact" onChange={(contactId) => set({ contactId })} />
      <Field label="Currency" value={fields.currency} maxLength={3} onChange={(event) => set({ currency: event.target.value.toUpperCase() })} />
      <Field label="Issue date" type="date" value={fields.issueDate} onChange={(event) => set({ issueDate: event.target.value })} />
      <Field label="Valid until" type="date" value={fields.validUntil} onChange={(event) => set({ validUntil: event.target.value })} />
    </div>
  )
}

type EditorProps = { id: string; initial: DraftFields; initialLines: LineAsText[]; companies: Option[]; people: Option[]; products: Product[]; defaultTaxRate: string }

/** A draft being written: its lines, a product picker, and totals that follow each key. Nothing is stored until it's saved. */
export function QuoteEditor({ id, initial, initialLines, companies, people, products, defaultTaxRate }: EditorProps) {
  const { setUnsaved } = useDesk()
  const { pending, run } = useRun()
  const nextKey = useRef(initialLines.length)
  const [fields, setFields] = useState(initial)
  const [lines, setLines] = useState<EditedLine[]>(() => initialLines.map((line, key) => ({ ...line, key })))
  const set = (patch: Partial<DraftFields>) => {
    setFields((current) => ({ ...current, ...patch }))
    setUnsaved(true)
  }
  const changeLines = (change: (current: EditedLine[]) => EditedLine[]) => {
    setLines(change)
    setUnsaved(true)
  }
  const addLine = () => changeLines((current) => [...current, { key: nextKey.current++, description: '', productId: null, quantity: '1', unitPrice: '0', taxRate: defaultTaxRate, discount: '' }])
  const live = liveTotals(lines, fields.currency)
  const save = () =>
    run(async () => {
      const saved = await saveDraft(id, { ...fields, companyId: fields.companyId || null, contactId: fields.contactId || null, lines: lines.map(withoutKey) })
      if (!saved.ok) throw new Error(saved.error)
      setUnsaved(false)
      toast.success('Saved')
    })
  return (
    <div className="space-y-5">
      <PartiesAndDates fields={fields} set={set} companies={companies} people={people} />
      <div className="divide-y rounded-lg border">
        {lines.map((line, index) => (
          <LineRow
            key={line.key}
            line={line}
            index={index}
            net={'totals' in live ? live.totals.lineNets[index] : undefined}
            currency={fields.currency}
            products={products}
            onChange={(patch) => changeLines((current) => current.map((other) => (other.key === line.key ? { ...other, ...patch } : other)))}
            onRemove={() => changeLines((current) => current.filter((other) => other.key !== line.key))}
          />
        ))}
        <div className="px-3 py-2">
          <Button variant="ghost" size="xs" onClick={addLine}>
            <Plus /> Add a line
          </Button>
        </div>
      </div>
      <LiveTotals live={live} currency={fields.currency} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="quote-notes">Notes</Label>
          <Textarea id="quote-notes" value={fields.notes} onChange={(event) => set({ notes: event.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="quote-terms">Terms</Label>
          <Textarea id="quote-terms" value={fields.terms} onChange={(event) => set({ terms: event.target.value })} />
        </div>
      </div>
      <Button loading={pending} onClick={save}>
        Save
      </Button>
    </div>
  )
}
