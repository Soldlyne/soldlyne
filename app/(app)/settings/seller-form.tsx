'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { saveSellerFromForm } from '@/lib/quotes/actions'
import type { Answer } from '@/lib/quotes/refusal'

type SellerValues = { legalName: string; address: string; companyNumber: string; vatNumber: string; contactEmail: string; defaultCurrency: string; defaultTaxRate: string; defaultValidityDays: string; defaultTerms: string; yearlyQuoteNumbers: boolean }

function Field({ name, label, hint, ...props }: { name: string; label: string; hint?: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={`seller-${name}`}>{label}</Label>
      <Input id={`seller-${name}`} name={name} {...props} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function TextField({ name, label, defaultValue }: { name: string; label: string; defaultValue: string }) {
  return (
    <div className="min-w-0 space-y-1.5 sm:col-span-2">
      <Label htmlFor={`seller-${name}`}>{label}</Label>
      <Textarea id={`seller-${name}`} name={name} defaultValue={defaultValue} />
    </div>
  )
}

/** A member who may not edit sees the same form, disabled: the server would refuse them anyway. */
export function SellerForm({ initial, mayEdit }: { initial: SellerValues; mayEdit: boolean }) {
  const [saved, submit, pending] = useActionState<Answer | null, FormData>(saveSellerFromForm, null)
  return (
    <form action={submit} className="rounded-lg border p-3">
      <fieldset disabled={!mayEdit} className="grid gap-3 sm:grid-cols-2">
        <Field name="legalName" label="Legal name" defaultValue={initial.legalName} />
        <Field name="contactEmail" label="Contact email" type="email" defaultValue={initial.contactEmail} hint="Customers' replies go here." />
        <TextField name="address" label="Address" defaultValue={initial.address} />
        <Field name="companyNumber" label="Company number" defaultValue={initial.companyNumber} />
        <Field name="vatNumber" label="VAT number" defaultValue={initial.vatNumber} hint="Leave it empty if you have none." />
        <Field name="defaultCurrency" label="Default currency" maxLength={3} defaultValue={initial.defaultCurrency} />
        <Field name="defaultTaxRate" label="Default tax rate (%)" inputMode="decimal" defaultValue={initial.defaultTaxRate} />
        <Field name="defaultValidityDays" label="Default validity (days)" inputMode="numeric" defaultValue={initial.defaultValidityDays} />
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="yearlyQuoteNumbers" defaultChecked={initial.yearlyQuoteNumbers} className="size-4" />
          Start quote numbers with the year (2026-0042)
        </label>
        <TextField name="defaultTerms" label="Default terms" defaultValue={initial.defaultTerms} />
      </fieldset>
      {mayEdit && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" loading={pending}>
            Save the seller details
          </Button>
          {saved && (
            <p role="status" className={`text-sm ${saved.ok ? 'text-muted-foreground' : 'text-destructive'}`}>
              {saved.ok ? 'Saved.' : saved.error}
            </p>
          )}
        </div>
      )}
    </form>
  )
}
