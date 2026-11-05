'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { MoreHorizontal, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

export function RecordMenu({ onDelete, redirectTo, label }: { onDelete: () => Promise<unknown>; redirectTo: string; label: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Record actions" loading={pending}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => {
            if (!confirm(`Delete this ${label}?`)) return
            startTransition(async () => {
              try {
                await onDelete()
                router.push(redirectTo)
              } catch {
                toast.error('Could not delete')
              }
            })
          }}
        >
          <Trash2 /> Delete {label}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
