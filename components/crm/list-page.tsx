import Link from 'next/link'
import { Search } from 'lucide-react'

/** Header of a record list: title, count, search box (?q=) and actions. */
export function ListHeader({ title, count, q, actions, placeholder, search = true }: { title: string; count: number; q?: string; actions?: React.ReactNode; placeholder?: string; search?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3 lg:px-6">
      <h1 className="text-base font-semibold">
        {title} <span className="num ml-1 font-normal text-muted-foreground">{count}</span>
      </h1>
      {search && <form className="relative ml-auto w-full max-w-64 sm:w-64">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          name="q"
          defaultValue={q}
          placeholder={placeholder ?? 'Filter'}
          className="h-8 w-full rounded-md border bg-background pr-2 pl-8 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
      </form>}
      <div className={search ? '' : 'ml-auto'}>{actions}</div>
    </div>
  )
}

export function Th({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return <th className={`h-9 border-b px-3 text-left text-xs font-medium whitespace-nowrap text-muted-foreground ${className}`}>{children}</th>
}

export function Td({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return <td className={`h-10 border-b px-3 text-sm whitespace-nowrap ${className}`}>{children}</td>
}

export function RowLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-medium hover:underline">
      {children}
    </Link>
  )
}

export function EmptyState({ title, hint, action }: { title: string; hint: string; action?: React.ReactNode }) {
  return (
    <div className="mx-auto mt-16 max-w-sm px-4 text-center">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
      {action && <div className="mt-4 flex justify-center gap-2">{action}</div>}
    </div>
  )
}
