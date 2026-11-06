'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, Building2, FileText, HeartHandshake, Magnet, CheckSquare, Home, Inbox, KanbanSquare, Package, Plug, Settings, Upload, Users, Handshake } from 'lucide-react'
import { LogoMark } from './logo'
import { WorkspaceSwitcher, type SwitchableWorkspace } from './workspace-switcher'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'

type NavItem = { title: string; url: string; icon: React.ComponentType<{ className?: string }>; badge?: number; dot?: string }
type NavGroup = { label?: string; items: NavItem[] }

export type SidebarProject = { id: string; name: string; color: string }

/** The entry whose URL is the longest prefix of the path is active. */
function activeUrl(pathname: string, groups: NavGroup[]): string | undefined {
  let best: string | undefined
  for (const item of groups.flatMap((group) => group.items)) {
    const matches = item.url === '/' ? pathname === '/' : pathname === item.url || pathname.startsWith(item.url + '/')
    if (matches && (!best || item.url.length > best.length)) best = item.url
  }
  return best
}

type AppSidebarProps = {
  projects: SidebarProject[]
  openTasks: number
  workspace: SwitchableWorkspace
  otherWorkspaces: SwitchableWorkspace[]
  mayStartWorkspace: boolean
}

export function AppSidebar({ projects, openTasks, workspace, otherWorkspaces, mayStartWorkspace }: AppSidebarProps) {
  const pathname = usePathname() ?? '/'
  const { isMobile, setOpenMobile } = useSidebar()

  const groups: NavGroup[] = [
    {
      items: [
        { title: 'Home', url: '/', icon: Home },
        { title: 'Tasks', url: '/tasks', icon: CheckSquare, badge: openTasks },
        { title: 'Reports', url: '/reports', icon: BarChart3 },
      ],
    },
    {
      label: 'Records',
      items: [
        { title: 'Companies', url: '/companies', icon: Building2 },
        { title: 'People', url: '/people', icon: Users },
        { title: 'Deals', url: '/deals', icon: Handshake },
        { title: 'Quotes', url: '/quotes', icon: FileText },
        { title: 'Products', url: '/products', icon: Package },
        { title: 'Partners', url: '/partners', icon: HeartHandshake },
      ],
    },
    {
      label: 'Pipelines',
      items: [
        { title: 'All deals', url: '/pipeline', icon: KanbanSquare },
        ...projects.map((project) => ({ title: project.name, url: `/pipeline/${project.id}`, icon: KanbanSquare, dot: project.color })),
      ],
    },
  ]
  const footer: NavItem[] = [
    { title: 'Import', url: '/import', icon: Upload },
    { title: 'Lead capture', url: '/lead-sources', icon: Magnet },
    { title: 'Mailboxes', url: '/mailboxes', icon: Inbox },
    { title: 'Connectors', url: '/connectors', icon: Plug },
    { title: 'Settings', url: '/settings', icon: Settings },
  ]
  const active = activeUrl(pathname, [...groups, { items: footer }])

  const renderItem = (item: NavItem) => {
    const isActive = item.url === active
    return (
      <SidebarMenuItem key={item.url}>
        <SidebarMenuButton asChild tooltip={item.title} isActive={isActive}>
          <Link href={item.url} aria-current={isActive ? 'page' : undefined} onClick={() => isMobile && setOpenMobile(false)}>
            {item.dot ? (
              <span aria-hidden className="flex size-4 items-center justify-center">
                <span className="size-2 rounded-full ring-1 ring-sidebar-foreground/40" style={{ backgroundColor: item.dot }} />
              </span>
            ) : (
              <item.icon aria-hidden />
            )}
            <span>{item.title}</span>
          </Link>
        </SidebarMenuButton>
        {item.badge ? <SidebarMenuBadge className="num">{item.badge}</SidebarMenuBadge> : null}
      </SidebarMenuItem>
    )
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link href="/" className="flex h-8 items-center gap-2 px-2 text-sm font-semibold">
          <LogoMark className="-ml-0.5 size-5 text-sidebar-primary" glyph="fill-sidebar-primary-foreground" />
          <span className="text-[0.95rem] font-bold tracking-tight group-data-[collapsible=icon]:hidden">Soldlyne</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group, index) => (
          <SidebarGroup key={group.label ?? index} className="py-1">
            {group.label ? <SidebarGroupLabel>{group.label}</SidebarGroupLabel> : null}
            <SidebarMenu>{group.items.map(renderItem)}</SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>{footer.map(renderItem)}</SidebarMenu>
        <WorkspaceSwitcher current={workspace} others={otherWorkspaces} mayStart={mayStartWorkspace} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
