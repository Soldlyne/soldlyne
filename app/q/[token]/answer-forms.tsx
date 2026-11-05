'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { Answered } from '@/lib/quotes/answer'

type Answering = (previous: Answered | null, form: FormData) => Promise<Answered>

const Refusal = ({ answered }: { answered: Answered | null }) =>
  answered && !answered.ok ? (
    <p role="alert" className="text-sm text-destructive">
      {answered.error}
    </p>
  ) : null

function AcceptForm({ accept, sellerName }: { accept: Answering; sellerName: string }) {
  const [answered, submit, pending] = useActionState<Answered | null, FormData>(accept, null)
  return (
    <form action={submit} className="space-y-3 rounded-lg border bg-background p-4">
      <h2 className="font-medium">Accept this quote</h2>
      <div className="space-y-1.5">
        <Label htmlFor="accept-name">Your name</Label>
        <Input id="accept-name" name="name" required maxLength={200} autoComplete="name" />
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirmed" required className="mt-0.5 size-4 shrink-0" />
        <span>I have read this quote and I accept it, as it stands, from {sellerName}.</span>
      </label>
      <p className="text-xs text-muted-foreground">Your name, the date, your IP address and your browser are recorded with your answer, and passed on to {sellerName}.</p>
      <Refusal answered={answered} />
      <Button type="submit" loading={pending}>
        Accept the quote
      </Button>
    </form>
  )
}

function DeclineForm({ decline }: { decline: Answering }) {
  const [answered, submit, pending] = useActionState<Answered | null, FormData>(decline, null)
  return (
    <details className="rounded-lg border bg-background p-4">
      <summary className="cursor-pointer font-medium">Decline this quote</summary>
      <form action={submit} className="mt-3 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="decline-reason">Why, if you&apos;d like to say</Label>
          <Textarea id="decline-reason" name="reason" maxLength={2000} />
        </div>
        <Refusal answered={answered} />
        <Button type="submit" variant="outline" loading={pending}>
          Decline the quote
        </Button>
      </form>
    </details>
  )
}

/** A customer's two answers. Each is a form they submit: opening the link alone changes nothing. */
export function AnswerForms({ accept, decline, sellerName }: { accept: Answering; decline: Answering; sellerName: string }) {
  return (
    <div className="space-y-4">
      <AcceptForm accept={accept} sellerName={sellerName} />
      <DeclineForm decline={decline} />
    </div>
  )
}
