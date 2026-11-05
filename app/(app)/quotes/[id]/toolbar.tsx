'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useRun } from '@/hooks/ui/use-run'
import { copyFromScreen, declineFromScreen, newLinkFromScreen, sendFromScreen } from '@/lib/quotes/actions'
import type { Answer } from '@/lib/quotes/refusal'
import type { SentQuote } from '@/lib/quotes/send'
import type { QuoteState } from '@/lib/quotes/status'
import { useDesk } from './desk'

async function orThrow<T extends object>(answering: Promise<Answer<T>>): Promise<T> {
  const answer = await answering
  if (!answer.ok) throw new Error(answer.error)
  return answer
}

function ConfirmDialog({ open, onOpenChange, title, description, action, pending, onConfirm, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; action: string; pending: boolean; onConfirm: () => void; children?: React.ReactNode }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter>
          <Button loading={pending} onClick={onConfirm}>
            {action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** What came of sending: a mail on its way, or the link to pass on, shown this once since only its hash is kept. */
function Delivered({ sent }: { sent: SentQuote }) {
  if (sent.mailedTo) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Sent to {sent.mailedTo}.
      </p>
    )
  }
  return (
    <div role="status" className="space-y-2">
      <p className="text-sm text-muted-foreground">No mail could leave: copy this link for the customer. It will not be shown again.</p>
      <p className="break-all rounded-md bg-surface px-3 py-2 font-mono text-xs" data-testid="quote-link">
        {sent.link}
      </p>
      <Button variant="outline" size="xs" onClick={() => navigator.clipboard.writeText(sent.link ?? '').then(() => toast.success('Link copied'))}>
        Copy the link
      </Button>
    </div>
  )
}

function SendButton({ id, reference, recipient, blocked, onSent }: { id: string; reference: string; recipient: string | null; blocked: boolean; onSent: (sent: SentQuote) => void }) {
  const { pending, run } = useRun()
  const [open, setOpen] = useState(false)
  const send = () =>
    run(async () => {
      onSent(await orThrow(sendFromScreen(id)))
      setOpen(false)
    })
  return (
    <>
      <Button size="sm" disabled={blocked} onClick={() => setOpen(true)}>
        Send
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Send quote ${reference}?`}
        description={`${recipient ? `${recipient} gets a link by mail` : 'You get a link to pass on'} to read it and accept or decline it. It can't be edited after that: a change means a copy, which is a new quote.`}
        action="Send the quote"
        pending={pending}
        onConfirm={send}
      />
    </>
  )
}

function CopyButton({ id }: { id: string }) {
  const router = useRouter()
  const { pending, run } = useRun()
  return (
    <Button variant="outline" size="sm" loading={pending} onClick={() => run(async () => router.push(`/quotes/${(await orThrow(copyFromScreen(id))).id}`))}>
      Copy
    </Button>
  )
}

function NewLinkButton({ id, recipient, onSent }: { id: string; recipient: string | null; onSent: (sent: SentQuote) => void }) {
  const { pending, run } = useRun()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        New link
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Make a new link?"
        description={`The link already out stops working. ${recipient ? `The new one goes to ${recipient}.` : "You'll get the new one to pass on."}`}
        action="Make a new link"
        pending={pending}
        onConfirm={() =>
          run(async () => {
            onSent(await orThrow(newLinkFromScreen(id)))
            setOpen(false)
          })
        }
      />
    </>
  )
}

function DeclineButton({ id }: { id: string }) {
  const { pending, run } = useRun()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Mark declined
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Mark this quote declined?"
        description="The deal stays where it is, and its timeline says so. The customer's link will show the quote as declined."
        action="Mark declined"
        pending={pending}
        onConfirm={() =>
          run(async () => {
            await orThrow(declineFromScreen(id, reason))
            setOpen(false)
          })
        }
      >
        <Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why, if you know" aria-label="Reason" />
      </ConfirmDialog>
    </>
  )
}

type ToolbarProps = { id: string; reference: string; state: QuoteState; recipient: string | null; missing: string[] }

/** What can be done with this quote. It stays on screen when the quote is sent, so what sending said is still there to read and copy. */
export function QuoteToolbar({ id, reference, state, recipient, missing }: ToolbarProps) {
  const { unsaved } = useDesk()
  const [sent, setSent] = useState<SentQuote | null>(null)
  const draft = state === 'DRAFT'
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {draft && (
          <Button variant="outline" size="sm" asChild={!unsaved} disabled={unsaved}>
            {unsaved ? 'Preview' : <Link href={`/quotes/${id}/preview`}>Preview</Link>}
          </Button>
        )}
        <Button variant="outline" size="sm" asChild>
          <a href={`/quotes/${id}/pdf`}>Download PDF</a>
        </Button>
        <CopyButton id={id} />
        {state === 'SENT' && <NewLinkButton id={id} recipient={recipient} onSent={setSent} />}
        {(state === 'SENT' || state === 'EXPIRED') && <DeclineButton id={id} />}
        {draft && <SendButton id={id} reference={reference} recipient={recipient} blocked={unsaved || missing.length > 0} onSent={setSent} />}
      </div>
      {draft && unsaved && <p className="text-sm text-muted-foreground">Save your changes to preview or send them.</p>}
      {draft && !unsaved && missing.length > 0 && (
        <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm" data-testid="missing-to-send">
          <p className="font-medium">Before this quote can be sent:</p>
          <ul className="mt-1 list-disc pl-5">
            {missing.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}
      {sent && <Delivered sent={sent} />}
    </div>
  )
}
