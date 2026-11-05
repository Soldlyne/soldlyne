'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

type Option = { value: string; label: string }

type Props = {
  label: string
  field: string
  value: string | null | undefined
  save: (patch: Record<string, unknown>) => Promise<unknown>
  type?: 'text' | 'url' | 'date' | 'select' | 'textarea' | 'list'
  options?: Option[]
  placeholder?: string
  /** Display override (formatted money, a linked record name...). */
  display?: React.ReactNode
  href?: string
  /** Turns the edited string into the value sent to `save`. */
  parse?: (input: string) => unknown
}

/**
 * A field row of a record page: label on the left, value on the right.
 * Click to edit; Enter or leaving the field saves, Escape cancels.
 */
export function EditableField({ label, field, value, save, type = 'text', options, placeholder = 'Empty', display, href, parse }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [pending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement & HTMLSelectElement>(null)

  // A new value from the server resets the draft (no effect needed).
  const [seen, setSeen] = useState(value)
  if (seen !== value && !editing) {
    setSeen(value)
    setDraft(value ?? '')
  }
  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  function commit(next = draft) {
    setEditing(false)
    if ((next ?? '') === (value ?? '')) return
    startTransition(async () => {
      try {
        const input = type === 'list' ? next.split(/[,\n]/).map((s) => s.trim()).filter(Boolean) : next
        await save({ [field]: parse ? parse(String(next)) : input === '' ? null : input })
      } catch (error) {
        setDraft(value ?? '')
        toast.error(error instanceof Error ? error.message : 'Could not save')
      }
    })
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      setDraft(value ?? '')
      setEditing(false)
    } else if (event.key === 'Enter' && (type !== 'textarea' || event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      commit()
    }
  }

  const inputClass = 'w-full rounded-md border bg-background px-2 py-1 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'
  let editor: React.ReactNode = null
  if (editing) {
    if (type === 'select') {
      editor = (
        <select
          ref={inputRef}
          className={inputClass}
          value={draft}
          onChange={(event) => commit(event.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={onKeyDown}
        >
          <option value="">{placeholder}</option>
          {options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )
    } else if (type === 'textarea') {
      editor = (
        <textarea
          ref={inputRef}
          rows={4}
          className={inputClass}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => commit()}
          onKeyDown={onKeyDown}
        />
      )
    } else {
      editor = (
        <input
          ref={inputRef}
          type={type === 'date' ? 'date' : 'text'}
          className={inputClass}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => commit()}
          onKeyDown={onKeyDown}
        />
      )
    }
  }

  const shown =
    display ??
    (type === 'select' ? options?.find((option) => option.value === value)?.label : null) ??
    (value || null)

  return (
    <div className="grid grid-cols-[7.5rem_1fr] items-start gap-2 py-1">
      <div className="truncate pt-1 text-sm text-muted-foreground">{label}</div>
      {editing ? (
        editor
      ) : (
        <div className="group flex min-h-7 min-w-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={cn(
              'min-w-0 flex-1 truncate rounded-md px-2 py-1 text-left text-sm hover:bg-accent',
              type === 'textarea' && 'whitespace-pre-wrap break-words',
              !shown && 'text-muted-foreground/60',
              pending && 'opacity-60',
            )}
          >
            {shown || placeholder}
          </button>
          {href && value ? (
            href.startsWith('/') ? (
              <Link href={href} className="shrink-0 rounded p-1 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100" aria-label={`Open ${label}`}>
                <ExternalLink className="size-3.5" />
              </Link>
            ) : (
              <a href={href} target="_blank" rel="noreferrer" className="shrink-0 rounded p-1 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100" aria-label={`Open ${label}`}>
                <ExternalLink className="size-3.5" />
              </a>
            )
          ) : null}
        </div>
      )}
    </div>
  )
}
