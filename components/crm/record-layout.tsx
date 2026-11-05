import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

/**
 * Record page: header, fields on the left (fixed width on desktop),
 * next steps and timeline on the right. Stacks on phones.
 */
export function RecordLayout({
  crumb,
  avatar,
  title,
  subtitle,
  actions,
  side,
  children,
}: {
  crumb: { href: string; label: string }
  avatar: React.ReactNode
  title: React.ReactNode
  subtitle?: React.ReactNode
  actions?: React.ReactNode
  side: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <aside className="shrink-0 border-b p-4 lg:w-[22rem] lg:border-r lg:border-b-0 lg:p-5">
        <nav className="mb-4 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href={crumb.href} className="hover:text-foreground">
            {crumb.label}
          </Link>
          <ChevronRight className="size-3" aria-hidden />
        </nav>
        <div className="flex items-start gap-3">
          {avatar}
          <div className="min-w-0 flex-1">
            <h1 className="text-lg leading-tight font-semibold">{title}</h1>
            {subtitle && <div className="mt-0.5 text-sm text-muted-foreground">{subtitle}</div>}
          </div>
          {actions}
        </div>
        <div className="mt-5 space-y-6">{side}</div>
      </aside>
      <section className="min-w-0 flex-1 space-y-6 p-4 lg:p-6">{children}</section>
    </div>
  )
}

export function SideSection({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-xs font-medium tracking-tight text-muted-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  )
}

export function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  )
}

const PALETTE = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6']

export function Monogram({ label, square = false, size = 'md' }: { label: string; square?: boolean; size?: 'sm' | 'md' }) {
  const initials = label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('')
  let hash = 0
  for (const char of label) hash = (hash * 31 + char.charCodeAt(0)) | 0
  const color = PALETTE[Math.abs(hash) % PALETTE.length]
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center font-medium text-white ${square ? 'rounded-md' : 'rounded-full'} ${size === 'sm' ? 'size-6 text-[10px]' : 'size-10 text-sm'}`}
      style={{ backgroundColor: color }}
    >
      {initials || '?'}
    </span>
  )
}
