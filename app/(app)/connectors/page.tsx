import type { Metadata } from 'next'
import { CANT_STORE, connectionViews } from '@/lib/connectors/connections'
import { CONNECTORS } from '@/lib/connectors/registry'
import { canSeal } from '@/lib/secrets'
import { managesConnectors } from '@/lib/workspaces/roles'
import { requireSeat } from '@/lib/workspaces/seat'
import { ConnectorCard } from './connector-card'

export const metadata: Metadata = { title: 'Connectors' }

export default async function ConnectorsPage() {
  const { workspace } = await requireSeat()
  const mayManage = managesConnectors(workspace.role)
  const connections = await connectionViews()
  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 p-4 lg:p-8">
      <div>
        <h1 className="text-xl font-semibold">Connectors</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This workspace&apos;s own accounts at the services Soldlyne works with. What you type here is tried with the service, then sealed: nobody sees it again, on this page or anywhere else.
          {!mayManage && ' Only owners and admins can change these.'}
        </p>
      </div>
      {mayManage && !canSeal() && <p className="rounded-lg border border-destructive/40 px-4 py-3 text-sm text-destructive">{CANT_STORE}</p>}
      <div className="space-y-4">
        {CONNECTORS.map((connector) => (
          <ConnectorCard key={connector.kind} connector={connector} connection={connections.find(({ kind }) => kind === connector.kind) ?? null} mayManage={mayManage} />
        ))}
      </div>
    </div>
  )
}
