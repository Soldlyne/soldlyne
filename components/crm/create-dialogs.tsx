'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { createCompany, createDeal, createPerson } from '@/lib/crm/actions'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Size = 'sm' | 'xs' | 'default'

function useCreate(onCreated: (id: string) => void) {
  const [pending, startTransition] = useTransition()
  const run = (fn: () => Promise<{ id: string }>) =>
    startTransition(async () => {
      try {
        const { id } = await fn()
        onCreated(id)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not create')
      }
    })
  return { pending, run }
}

function Trigger({ size, label, onClick }: { size: Size; label: string; onClick: () => void }) {
  return size === 'xs' ? (
    <Button variant="ghost" size="icon-xs" onClick={onClick} aria-label={label}>
      <Plus />
    </Button>
  ) : (
    <Button size={size} onClick={onClick}>
      <Plus /> {label}
    </Button>
  )
}

function Field({ id, label, ...props }: { id: string; label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} {...props} />
    </div>
  )
}

export function NewCompanyButton({ size = 'sm' }: { size?: Size }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const { pending, run } = useCreate((id) => {
    setOpen(false)
    router.push(`/companies/${id}`)
  })
  return (
    <>
      <Trigger size={size} label="New company" onClick={() => setOpen(true)} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New company</DialogTitle>
            <DialogDescription>With a domain, emails from that domain are linked to it.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              const form = new FormData(event.currentTarget)
              run(() => createCompany({ name: String(form.get('name')), domain: String(form.get('domain')) }))
            }}
          >
            <Field id="name" label="Name" required autoFocus />
            <Field id="domain" label="Domain" placeholder="acme.com" />
            <DialogFooter>
              <Button type="submit" loading={pending}>
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function NewPersonButton({ companyId, size = 'sm' }: { companyId?: string; size?: Size }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const { pending, run } = useCreate((id) => {
    setOpen(false)
    if (companyId) router.refresh()
    else router.push(`/people/${id}`)
  })
  return (
    <>
      <Trigger size={size} label="New person" onClick={() => setOpen(true)} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New person</DialogTitle>
            <DialogDescription className="sr-only">Add a contact.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              const form = new FormData(event.currentTarget)
              run(() =>
                createPerson({
                  firstName: String(form.get('firstName')),
                  lastName: String(form.get('lastName')),
                  email: String(form.get('email')) || undefined,
                  jobTitle: String(form.get('jobTitle')) || undefined,
                  companyId,
                }),
              )
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <Field id="firstName" label="First name" autoFocus />
              <Field id="lastName" label="Last name" />
            </div>
            <Field id="email" label="Email" type="email" />
            <Field id="jobTitle" label="Job title" />
            <DialogFooter>
              <Button type="submit" loading={pending}>
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

type ProductOption = { id: string; name: string; color: string; label?: string; project?: { color: string } | null }

export function NewDealButton({
  products,
  companyId,
  contactId,
  productId,
  defaultName,
  size = 'sm',
}: {
  products: ProductOption[]
  companyId?: string
  contactId?: string
  productId?: string
  defaultName?: string
  size?: Size
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [product, setProduct] = useState(productId ?? products[0]?.id ?? '')
  const { pending, run } = useCreate((id) => {
    setOpen(false)
    router.push(`/deals/${id}`)
  })
  return (
    <>
      <Trigger size={size} label="New deal" onClick={() => setOpen(true)} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New deal</DialogTitle>
            <DialogDescription className="sr-only">Open an opportunity for one of your products.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              const form = new FormData(event.currentTarget)
              run(() =>
                createDeal({
                  name: String(form.get('name')),
                  productId: product,
                  companyId: companyId ?? null,
                  contactId: contactId ?? null,
                  amount: String(form.get('amount')) || null,
                }),
              )
            }}
          >
            <div className="space-y-1.5">
              <Label>Product</Label>
              <div className="flex flex-wrap gap-1">
                {products.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setProduct(option.id)}
                    className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${product === option.id ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
                  >
                    <span className="size-2 rounded-full" style={{ backgroundColor: option.project?.color ?? option.color }} aria-hidden />
                    {option.label ?? option.name}
                  </button>
                ))}
                {products.length === 0 && <p className="text-sm text-muted-foreground">No product yet: add one in Settings first.</p>}
              </div>
            </div>
            <Field id="name" label="Name" required autoFocus defaultValue={defaultName} />
            <Field id="amount" label="Amount (EUR)" inputMode="decimal" placeholder="12 000" />
            <DialogFooter>
              <Button type="submit" loading={pending} disabled={!product}>
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
