'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useRun } from '@/hooks/ui/use-run'
import { checkFromScreen, disconnectFromScreen } from '@/lib/connectors/actions'
import type { ConnectorAnswer } from '@/lib/connectors/connections'

async function orThrow(answering: Promise<ConnectorAnswer>) {
  const answer = await answering
  if (!answer.ok) throw new Error(answer.error)
  return answer
}

/** Tries the saved credentials with the service. Its answer is a toast, like any other action's; a refusal also stays on the card. */
export function CheckButton({ kind }: { kind: string }) {
  const { pending, run } = useRun()
  const check = async () => toast.success((await orThrow(checkFromScreen(kind))).note ?? 'It works.')
  return (
    <Button variant="outline" size="sm" loading={pending} onClick={() => run(check)}>
      Check
    </Button>
  )
}

/** Says what stops before anything does: mailboxes and quotes depend on these. */
export function DisconnectButton({ kind, name, whatStops }: { kind: string; name: string; whatStops: string }) {
  const { pending, run } = useRun()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Disconnect
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Disconnect {name}?</DialogTitle>
            <DialogDescription>{whatStops}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="destructive" loading={pending} onClick={() => run(() => orThrow(disconnectFromScreen(kind)), () => setOpen(false))}>
              Disconnect {name}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function ReplaceCredentials({ children }: { children: React.ReactNode }) {
  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button variant="link" size="sm">
          Replace the credentials
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  )
}
