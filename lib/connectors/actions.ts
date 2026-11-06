'use server'

import { revalidatePath } from 'next/cache'
import { managesConnectors } from '@/lib/workspaces/roles'
import { requireSeat } from '@/lib/workspaces/seat'
import { checkConnection, connectWith, disconnectConnection, type ConnectorAnswer } from './connections'
import { connectorOf } from './registry'
import type { ConnectorDefinition } from './types'

const NOT_ALLOWED: ConnectorAnswer = { ok: false, error: 'Only owners and admins can change connectors.' }
const NO_SUCH: ConnectorAnswer = { ok: false, error: "This connector doesn't exist." }

/** An owner or admin of the browser's workspace, on a connector that exists; anyone else gets the refusal. Read on each call: a role can change while a page stays open. */
async function asManager(kind: string, work: (connector: ConnectorDefinition, email: string) => Promise<ConnectorAnswer>): Promise<ConnectorAnswer> {
  const { user, workspace } = await requireSeat()
  if (!managesConnectors(workspace.role)) return NOT_ALLOWED
  const connector = connectorOf(kind)
  if (!connector) return NO_SUCH
  const answer = await work(connector, user.email)
  revalidatePath('/', 'layout')
  return answer
}

/** What a member typed. It reaches the connector and the seal, and is never sent back or logged. */
export async function connectFromForm(kind: string, _previous: ConnectorAnswer | null, form: FormData): Promise<ConnectorAnswer> {
  return asManager(kind, (connector, email) => connectWith(connector, Object.fromEntries(form), email))
}

export async function checkFromScreen(kind: string): Promise<ConnectorAnswer> {
  return asManager(kind, checkConnection)
}

export async function disconnectFromScreen(kind: string): Promise<ConnectorAnswer> {
  return asManager(kind, async (connector) => {
    await disconnectConnection(connector.kind)
    return { ok: true }
  })
}
