'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  History,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Phone,
  StickyNote,
  Trash2,
} from 'lucide-react'
import { LinkedinIcon } from '@/components/crm/icons'
import type { TimelineEntry } from '@/lib/crm/queries'
import { deleteActivity, deleteNote } from '@/lib/crm/actions'
import { ACTIVITY_LABELS, formatDateTime, formatRelative, personName } from '@/lib/crm/format'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

const TYPE_ICONS = {
  CALL: Phone,
  EMAIL: Mail,
  LINKEDIN: LinkedinIcon,
  MEETING: CalendarDays,
  SOCIAL: MessageSquare,
  SMS: MessageSquare,
  OTHER: MessageSquare,
} as const

type Filter = 'all' | 'activity' | 'note' | 'event'
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'activity', label: 'Interactions' },
  { value: 'note', label: 'Notes' },
  { value: 'event', label: 'History' },
]

const FIELD_LABELS: Record<string, string> = {
  name: 'name',
  domain: 'domain',
  firstName: 'first name',
  lastName: 'last name',
  jobTitle: 'job title',
  companyId: 'company',
  contactId: 'contact',
  productId: 'product',
  amount: 'amount',
  closeDate: 'close date',
  linkedinUrl: 'LinkedIn',
  custom: 'custom fields',
}

function eventText(name: string, properties: unknown): string {
  const props = (properties ?? {}) as { from?: string; to?: string; diff?: Record<string, unknown> }
  const [object, action] = name.split('.')
  if (action === 'stage_changed') return `Stage changed from ${props.from} to ${props.to}`
  if (action === 'updated') {
    const fields = Object.keys(props.diff ?? {}).map((field) => FIELD_LABELS[field] ?? field)
    return `Updated ${fields.join(', ')}`
  }
  const noun = object === 'person' ? 'Person' : object === 'company' ? 'Company' : 'Deal'
  return `${noun} ${action}`
}

export function Timeline({ entries, emptyHint }: { entries: TimelineEntry[]; emptyHint?: string }) {
  const [filter, setFilter] = useState<Filter>('all')
  const shown = entries.filter((entry) => filter === 'all' || entry.kind === filter)

  return (
    <div>
      <div className="mb-3 flex gap-1">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setFilter(option.value)}
            className={cn(
              'rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground',
              filter === option.value && 'bg-accent text-foreground',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          {emptyHint ?? 'Nothing here yet.'}
        </p>
      ) : (
        <ol className="relative space-y-1 before:absolute before:top-2 before:bottom-2 before:left-[13px] before:w-px before:bg-border">
          {shown.map((entry) => (
            <li key={`${entry.kind}-${entry.kind === 'activity' ? entry.activity.id : entry.kind === 'note' ? entry.note.id : entry.event.id}`}>
              {entry.kind === 'activity' && <ActivityItem activity={entry.activity} />}
              {entry.kind === 'note' && <NoteItem note={entry.note} />}
              {entry.kind === 'event' && (
                <div className="flex items-center gap-3 py-1.5 pl-1 text-xs text-muted-foreground">
                  <span className="relative z-10 flex size-[18px] items-center justify-center rounded-full bg-background">
                    <History className="size-3" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{eventText(entry.event.name, entry.event.properties)}</span>
                  <time title={formatDateTime(entry.event.happenedAt)}>{formatRelative(entry.event.happenedAt)}</time>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function ItemMenu({ onDelete }: { onDelete: () => Promise<unknown> }) {
  const [pending, startTransition] = useTransition()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded p-1 text-muted-foreground opacity-0 hover:bg-accent group-hover:opacity-100 data-[state=open]:opacity-100" aria-label="Actions">
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          variant="destructive"
          disabled={pending}
          onSelect={() => startTransition(async () => {
            try {
              await onDelete()
            } catch {
              toast.error('Could not delete')
            }
          })}
        >
          <Trash2 /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ActivityItem({ activity }: { activity: Extract<TimelineEntry, { kind: 'activity' }>['activity'] }) {
  const Icon = TYPE_ICONS[activity.type]
  const people = activity.participants.filter((p) => p.person).map((p) => p.person!)
  return (
    <div className="group flex gap-3 rounded-lg py-2 pr-1">
      <span className="relative z-10 mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border bg-background">
        <Icon className="size-3.5 text-muted-foreground" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">{ACTIVITY_LABELS[activity.type]}</span>
          {activity.direction === 'INBOUND' && <ArrowDownLeft className="size-3.5 text-muted-foreground" aria-label="Inbound" />}
          {activity.direction === 'OUTBOUND' && <ArrowUpRight className="size-3.5 text-muted-foreground" aria-label="Outbound" />}
          {people.length > 0 && (
            <span className="min-w-0 truncate text-muted-foreground">
              {people.map((person, index) => (
                <span key={person.id}>
                  {index > 0 && ', '}
                  <Link href={`/people/${person.id}`} className="hover:text-foreground hover:underline">
                    {personName(person)}
                  </Link>
                </span>
              ))}
            </span>
          )}
          <time className="ml-auto shrink-0 text-xs text-muted-foreground" title={formatDateTime(activity.occurredAt)}>
            {formatRelative(activity.occurredAt)}
          </time>
          <ItemMenu onDelete={() => deleteActivity(activity.id)} />
        </div>
        {activity.subject && <p className="mt-0.5 text-sm">{activity.subject}</p>}
        {activity.outcome && <p className="mt-0.5 text-sm text-muted-foreground">→ {activity.outcome}</p>}
        {activity.body && <p className="mt-1 line-clamp-6 text-sm whitespace-pre-wrap text-muted-foreground">{activity.body}</p>}
        {activity.deal && (
          <Link href={`/deals/${activity.deal.id}`} className="mt-1 inline-block text-xs text-link hover:underline">
            {activity.deal.name}
          </Link>
        )}
      </div>
    </div>
  )
}

function NoteItem({ note }: { note: Extract<TimelineEntry, { kind: 'note' }>['note'] }) {
  return (
    <div className="group flex gap-3 py-2 pr-1">
      <span className="relative z-10 mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border bg-background">
        <StickyNote className="size-3.5 text-muted-foreground" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 rounded-lg border bg-surface px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Note</span>
          <time className="ml-auto text-xs text-muted-foreground" title={formatDateTime(note.createdAt)}>
            {formatRelative(note.createdAt)}
          </time>
          <ItemMenu onDelete={() => deleteNote(note.id)} />
        </div>
        <p className="mt-1 text-sm whitespace-pre-wrap">{note.body}</p>
      </div>
    </div>
  )
}
