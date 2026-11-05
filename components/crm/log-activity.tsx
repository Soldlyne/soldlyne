'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { CalendarDays, Mail, MessageSquare, Phone, StickyNote } from 'lucide-react'
import { LinkedinIcon } from '@/components/crm/icons'
import { createNote, logActivity } from '@/lib/crm/actions'
import { ACTIVITY_LABELS, ACTIVITY_TYPES, personName } from '@/lib/crm/format'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

type ActivityType = (typeof ACTIVITY_TYPES)[number]
type PersonOption = { id: string; firstName: string; lastName: string; emails: string[] }

type Context = {
  companyId?: string | null
  dealId?: string | null
  /** People pre-selected as participants (the person of a person page). */
  personIds?: string[]
  /** People offered as participants (a company's people, a deal's contact...). */
  people?: PersonOption[]
}

const QUICK: { type: ActivityType; icon: React.ComponentType<{ className?: string }> }[] = [
  { type: 'CALL', icon: Phone },
  { type: 'EMAIL', icon: Mail },
  { type: 'LINKEDIN', icon: LinkedinIcon },
  { type: 'MEETING', icon: CalendarDays },
  { type: 'SOCIAL', icon: MessageSquare },
]

const OUTCOMES: Partial<Record<ActivityType, string[]>> = {
  CALL: ['No answer', 'Left voicemail', 'Call back later', 'Interested', 'Not interested'],
  EMAIL: ['Sent', 'Replied', 'No reply'],
  LINKEDIN: ['Connection sent', 'Connected', 'Message sent', 'Replied'],
  MEETING: ['Held', 'No-show', 'Rescheduled'],
}

function localDateTime(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function inDays(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

/** The composer above a record's timeline: log an interaction or write a note. */
export function ActivityComposer(context: Context) {
  const [type, setType] = useState<ActivityType | null>(null)
  const [note, setNote] = useState('')
  const [pending, startTransition] = useTransition()

  const saveNote = () =>
    startTransition(async () => {
      try {
        await createNote({ body: note, companyId: context.companyId, dealId: context.dealId, personId: context.personIds?.[0] })
        setNote('')
      } catch {
        toast.error('Could not save the note')
      }
    })

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center gap-1 border-b px-2 py-1.5">
        <span className="px-1 text-xs font-medium text-muted-foreground">Log</span>
        {QUICK.map(({ type: quickType, icon: Icon }) => (
          <Button key={quickType} variant="ghost" size="xs" onClick={() => setType(quickType)}>
            <Icon /> {ACTIVITY_LABELS[quickType]}
          </Button>
        ))}
      </div>
      <div className="flex items-start gap-2 p-2">
        <StickyNote className="mt-2 ml-1 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <Textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && note.trim()) saveNote()
          }}
          placeholder="Write a note... (⌘↵ to save)"
          rows={note ? 3 : 1}
          className="min-h-9 resize-none border-0 shadow-none focus-visible:ring-0"
        />
        {note.trim() && (
          <Button size="sm" onClick={saveNote} loading={pending}>
            Save
          </Button>
        )}
      </div>
      {type && <LogActivityDialog type={type} onClose={() => setType(null)} context={context} />}
    </div>
  )
}

function LogActivityDialog({ type: initialType, onClose, context }: { type: ActivityType; onClose: () => void; context: Context }) {
  const [type, setType] = useState(initialType)
  const [direction, setDirection] = useState<'OUTBOUND' | 'INBOUND'>('OUTBOUND')
  const [outcome, setOutcome] = useState('')
  const [personIds, setPersonIds] = useState<string[]>(context.personIds ?? (context.people?.length === 1 ? [context.people[0].id] : []))
  const [nextTitle, setNextTitle] = useState('Follow up')
  const [nextDue, setNextDue] = useState<string | null>(inDays(3))
  const [pending, startTransition] = useTransition()

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    startTransition(async () => {
      try {
        await logActivity({
          type,
          direction: type === 'MEETING' ? null : direction,
          occurredAt: new Date(String(form.get('occurredAt'))),
          subject: String(form.get('subject') ?? ''),
          body: String(form.get('body') ?? ''),
          outcome,
          companyId: context.companyId,
          dealId: context.dealId,
          personIds,
          nextTask: nextDue !== null && nextTitle.trim() ? { title: nextTitle, dueAt: nextDue ? new Date(nextDue + 'T09:00') : null } : null,
        })
        toast.success(`${ACTIVITY_LABELS[type]} logged`)
        onClose()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not log the activity')
      }
    })
  }

  const chip = (active: boolean) =>
    cn('rounded-md border px-2 py-1 text-xs transition-colors', active ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent')

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Log {ACTIVITY_LABELS[type].toLowerCase()}</DialogTitle>
          <DialogDescription className="sr-only">Record an interaction and plan the next step.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="flex flex-wrap gap-1">
            {ACTIVITY_TYPES.map((option) => (
              <button key={option} type="button" className={chip(option === type)} onClick={() => setType(option)}>
                {ACTIVITY_LABELS[option]}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {type !== 'MEETING' && (
              <div className="space-y-1.5">
                <Label>Direction</Label>
                <div className="flex gap-1">
                  <button type="button" className={chip(direction === 'OUTBOUND')} onClick={() => setDirection('OUTBOUND')}>
                    Outbound
                  </button>
                  <button type="button" className={chip(direction === 'INBOUND')} onClick={() => setDirection('INBOUND')}>
                    Inbound
                  </button>
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="occurredAt">When</Label>
              <Input id="occurredAt" name="occurredAt" type="datetime-local" defaultValue={localDateTime()} required />
            </div>
          </div>
          {context.people && context.people.length > 0 && (
            <div className="space-y-1.5">
              <Label>With</Label>
              <div className="flex flex-wrap gap-1">
                {context.people.map((person) => {
                  const active = personIds.includes(person.id)
                  return (
                    <button
                      key={person.id}
                      type="button"
                      className={chip(active)}
                      onClick={() => setPersonIds((ids) => (active ? ids.filter((id) => id !== person.id) : [...ids, person.id]))}
                    >
                      {personName(person)}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          {OUTCOMES[type] && (
            <div className="space-y-1.5">
              <Label>Outcome</Label>
              <div className="flex flex-wrap gap-1">
                {OUTCOMES[type]!.map((option) => (
                  <button key={option} type="button" className={chip(outcome === option)} onClick={() => setOutcome(outcome === option ? '' : option)}>
                    {option}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="subject">Subject</Label>
            <Input id="subject" name="subject" placeholder={type === 'CALL' ? 'Discovery call' : ''} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="body">Notes</Label>
            <Textarea id="body" name="body" rows={3} />
          </div>
          <div className="space-y-2 rounded-lg bg-surface p-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="nextTitle">Next step</Label>
              <div className="flex gap-1">
                {[
                  ['Tomorrow', 1],
                  ['3 days', 3],
                  ['1 week', 7],
                  ['2 weeks', 14],
                ].map(([label, days]) => (
                  <button key={label} type="button" className={chip(nextDue === inDays(days as number))} onClick={() => setNextDue(inDays(days as number))}>
                    {label}
                  </button>
                ))}
                <button type="button" className={chip(nextDue === null)} onClick={() => setNextDue(null)}>
                  None
                </button>
              </div>
            </div>
            {nextDue !== null && (
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Input id="nextTitle" value={nextTitle} onChange={(event) => setNextTitle(event.target.value)} />
                <Input type="date" value={nextDue} onChange={(event) => setNextDue(event.target.value)} className="w-40" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Log {ACTIVITY_LABELS[type].toLowerCase()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
