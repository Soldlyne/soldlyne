import { Badge } from '@/components/ui/badge'
import type { ConnectionView } from '@/lib/connectors/connections'
import { publicUrl } from '@/lib/public-url'
import type { ConnectorDefinition, SetupStep } from '@/lib/connectors/types'
import { formatDateTime } from '@/lib/crm/format'
import { CheckButton, DisconnectButton, ReplaceCredentials } from './connector-buttons'
import { ConnectForm } from './connect-form'

function StateBadge({ connection }: { connection: ConnectionView | null }) {
  if (!connection) return <Badge variant="muted">Not connected</Badge>
  return connection.status === 'CONNECTED' ? <Badge variant="success">Connected</Badge> : <Badge variant="destructive">Refused</Badge>
}

/** Who connected it and when it was last tried, with the fields that aren't secret. Sealed ones have no place here at all. */
function Details({ connector, connection }: { connector: ConnectorDefinition; connection: ConnectionView }) {
  const settings = connection.settings as Record<string, string>
  return (
    <div className="mt-3 space-y-1 text-xs text-muted-foreground">
      {connector.fields
        .filter(({ secret, key }) => !secret && settings[key])
        .map(({ key, label }) => (
          <p key={key} className="break-words">
            {label}: <span className="text-foreground">{settings[key]}</span>
          </p>
        ))}
      <p>
        Connected by {connection.connectedBy}.{connection.checkedAt && ` Last tried ${formatDateTime(connection.checkedAt)}.`}
      </p>
    </div>
  )
}

function Setup({ steps }: { steps: SetupStep[] }) {
  return (
    <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
      {steps.map(({ text, address }) => (
        <li key={text}>
          {text}
          {address && <p className="mt-1 break-all rounded-md bg-surface px-3 py-2 font-mono text-xs text-foreground">{address}</p>}
        </li>
      ))}
    </ol>
  )
}

function ConnectSteps({ connector, action }: { connector: ConnectorDefinition; action: string }) {
  return (
    <div className="mt-4 space-y-4">
      <Setup steps={connector.setup(publicUrl())} />
      <ConnectForm kind={connector.kind} fields={connector.fields} action={action} />
    </div>
  )
}

/** One service: connected or not and what it's for, for everyone; connecting, trying and disconnecting for those who may. */
export async function ConnectorCard({ connector, connection, mayManage }: { connector: ConnectorDefinition; connection: ConnectionView | null; mayManage: boolean }) {
  return (
    <section aria-label={connector.name} className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-medium">{connector.name}</h2>
        <StateBadge connection={connection} />
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{connector.summary}</p>
      {connector.rule && <p className="mt-1 text-sm text-muted-foreground">{connector.rule}</p>}
      {connection && <Details connector={connector} connection={connection} />}
      {connection?.lastError && <p className="mt-2 text-sm text-destructive">{connection.lastError}</p>}
      {mayManage && !connection && <ConnectSteps connector={connector} action="Try and connect" />}
      {mayManage && connection && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <CheckButton kind={connector.kind} />
            <DisconnectButton kind={connector.kind} name={connector.name} whatStops={await connector.whatStops()} />
          </div>
          <ReplaceCredentials>
            <ConnectSteps connector={connector} action="Try and replace" />
          </ReplaceCredentials>
        </div>
      )}
    </section>
  )
}
