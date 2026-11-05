import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { CommandMenu } from '@/components/layout/command-menu'
import { listProjects, openTaskCount } from '@/lib/crm/queries'
import { requireSeat } from '@/lib/workspaces/seat'
import { mayStartWorkspace } from '@/lib/workspaces/workspaces'

export default async function AppLayout({ children }: LayoutProps<'/'>) {
  const { user, workspace, workspaces } = await requireSeat()
  const [projects, openTasks] = await Promise.all([listProjects(), openTaskCount()])
  return (
    <SidebarProvider>
      <AppSidebar
        projects={projects.map(({ id, name, color }) => ({ id, name, color }))}
        openTasks={openTasks}
        workspace={{ id: workspace.id, name: workspace.name }}
        otherWorkspaces={workspaces.filter(({ id }) => id !== workspace.id).map(({ id, name }) => ({ id, name }))}
        mayStartWorkspace={mayStartWorkspace(user, process.env)}
      />
      <SidebarInset className="min-w-0">
        <header
          data-slot="app-header"
          className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80"
        >
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
          <CommandMenu />
        </header>
        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
