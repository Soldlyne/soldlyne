import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { listProducts, listStages } from '@/lib/crm/queries'
import { requireSeat } from '@/lib/workspaces/seat'
import { ProductsEditor, ProjectsEditor, StagesEditor, FieldsEditor } from './editors'
import { SellerSection } from './seller-section'
import { TeamSection } from './team-section'
import { mcpResource } from '@/lib/auth'
import { Panel } from '@/components/crm/record-layout'

export const metadata: Metadata = { title: 'Settings' }

export default async function SettingsPage() {
  const seat = await requireSeat()
  const [projects, products, stages, fields] = await Promise.all([
    prisma.project.findMany({ orderBy: { position: 'asc' } }),
    listProducts({ includeArchived: true }),
    listStages(),
    prisma.customField.findMany({ orderBy: [{ object: 'asc' }, { position: 'asc' }] }),
  ])
  return (
    <div className="mx-auto w-full max-w-3xl space-y-10 p-4 lg:p-8">
      <h1 className="text-xl font-semibold">Settings</h1>
      <TeamSection seat={seat} />
      <SellerSection role={seat.workspace.role} />
      <Panel title="Projects">
        <p className="mb-3 text-sm text-muted-foreground">Commercial brands. Each gets its own pipeline in the sidebar. Details are on the Products page.</p>
        <ProjectsEditor projects={projects} />
      </Panel>
      <Panel title="Products">
        <p className="mb-3 text-sm text-muted-foreground">What each project sells. Deals are opened for a product.</p>
        <ProductsEditor products={products} projects={projects} />
      </Panel>
      <Panel title="Pipeline stages">
        <p className="mb-3 text-sm text-muted-foreground">Shared by every product. The probability feeds the weighted pipeline.</p>
        <StagesEditor stages={stages} />
      </Panel>
      <Panel title="Assistants">
        <p className="text-sm text-muted-foreground">
          Add this address to Claude, ChatGPT or any MCP client as a remote connector: you sign in and approve it, and it can read and update Soldlyne in the workspaces you belong to. Everything it does is recorded as done by MCP.
        </p>
        <p className="mt-2 rounded-md bg-surface px-3 py-2 font-mono text-xs">{mcpResource()}</p>
      </Panel>
      <Panel title="Custom fields">
        <p className="mb-3 text-sm text-muted-foreground">Extra fields shown on record pages. Imports create them for unmapped columns.</p>
        <FieldsEditor fields={fields} />
      </Panel>
    </div>
  )
}
