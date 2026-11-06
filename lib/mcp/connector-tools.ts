import 'server-only'
import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { mcpMemberRole } from '@/lib/actor'
import { checkConnection, connectionOf, connectionViews, type ConnectionView } from '@/lib/connectors/connections'
import { connectorOf, CONNECTORS } from '@/lib/connectors/registry'
import type { ConnectorDefinition } from '@/lib/connectors/types'
import { managesConnectors } from '@/lib/workspaces/roles'
import { READ, run, type PageLink } from './results'

const KIND = z.string().describe('The connector, by its kind from list_connectors.')

const connectorNamed = (kind: string): ConnectorDefinition => {
  const connector = connectorOf(kind)
  if (!connector) throw new Error(`No connector "${kind}". Call list_connectors for the kinds.`)
  return connector
}

/** State only. Sealed fields never reach this, and a failure is in Soldlyne's words: what a service answers can carry anything. */
function connectorForAssistant(connector: ConnectorDefinition, connection: ConnectionView | null) {
  return {
    kind: connector.kind,
    name: connector.name,
    summary: connector.summary,
    rule: connector.rule ?? null,
    connected: connection !== null,
    status: connection?.status.toLowerCase() ?? 'not connected',
    details: connection?.settings ?? {},
    checkedAt: connection?.checkedAt ?? null,
    lastError: connection?.lastError ?? null,
  }
}

/**
 * What an assistant can do about connectors: see them, hand over the page, and try them. Connecting and
 * disconnecting stay on the screen, like the seller details: keys don't belong in a conversation, and
 * what's written in records can carry instructions, while what a disconnect costs takes a person to undo.
 */
export function registerConnectorTools(server: Pick<McpServer, 'registerTool'>, link: PageLink) {
  server.registerTool(
    'list_connectors',
    {
      title: 'Services this workspace can connect',
      description: "Every service this workspace can connect to Soldlyne, what each is for, whether it's connected and working, and when it was last tried. Never its keys: nobody can read them back.",
      inputSchema: z.object({}),
      annotations: READ,
    },
    () =>
      run(async () => {
        const connections = await connectionViews()
        return CONNECTORS.map((connector) => connectorForAssistant(connector, connections.find(({ kind }) => kind === connector.kind) ?? null))
      }),
  )

  server.registerTool(
    'connect_service',
    {
      title: 'Connect a service',
      description: "Gives the page where an owner or an admin connects a service. Keys and secrets are typed there, never in this conversation: never ask for them, and don't offer to pass them on.",
      inputSchema: z.object({ kind: KIND }),
      annotations: READ,
    },
    ({ kind }) =>
      run(async () => {
        const connector = connectorNamed(kind)
        const mayConnect = managesConnectors(mcpMemberRole())
        return { kind: connector.kind, name: connector.name, url: link('/connectors'), mayConnect, note: mayConnect ? `Send the member to this page to connect ${connector.name}.` : `Only an owner or an admin of this workspace can connect ${connector.name}: this member can see it on that page, and should ask one of them.` }
      }),
  )

  server.registerTool(
    'check_connection',
    {
      title: 'Check a connection',
      description: "For a member who is an owner or an admin: tries a connected service's saved credentials again, sends nothing to anyone, and records the answer. Says what came of it in Soldlyne's own words.",
      inputSchema: z.object({ kind: KIND }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    ({ kind }) =>
      run(async () => {
        if (!managesConnectors(mcpMemberRole())) throw new Error('Only owners and admins can check connectors.')
        const connector = connectorNamed(kind)
        const answer = await checkConnection(connector)
        return { kind: connector.kind, works: answer.ok, said: answer.ok ? (answer.note ?? 'It works.') : answer.error, status: (await connectionOf(connector.kind))?.status.toLowerCase() ?? 'not connected' }
      }),
  )
}
