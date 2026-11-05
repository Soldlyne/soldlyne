'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { ChevronsUpDown, LogOut, Plus } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'
import { switchWorkspace } from '@/lib/workspaces/actions'
import { signOut } from './sign-out-button'

export type SwitchableWorkspace = { id: string; name: string }

/** The workspace this is, the member's others, starting a new one for those who may, and signing out. */
export function WorkspaceSwitcher({ current, others, mayStart }: { current: SwitchableWorkspace; others: SwitchableWorkspace[]; mayStart: boolean }) {
  const [switching, startSwitch] = useTransition()
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton tooltip={current.name} aria-label={`Workspace ${current.name}: open the menu`} disabled={switching}>
              <span aria-hidden className="flex size-4 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-semibold uppercase">
                {current.name.slice(0, 1)}
              </span>
              <span className="truncate font-medium">{current.name}</span>
              <ChevronsUpDown aria-hidden className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            {others.map((workspace) => (
              <DropdownMenuItem key={workspace.id} onSelect={() => startSwitch(() => switchWorkspace(workspace.id))}>
                <span className="truncate">{workspace.name}</span>
              </DropdownMenuItem>
            ))}
            {mayStart && (
              <DropdownMenuItem asChild>
                <Link href="/welcome?another=1">
                  <Plus aria-hidden /> New workspace
                </Link>
              </DropdownMenuItem>
            )}
            {(others.length > 0 || mayStart) && <DropdownMenuSeparator />}
            <DropdownMenuItem onSelect={() => signOut()}>
              <LogOut aria-hidden /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
