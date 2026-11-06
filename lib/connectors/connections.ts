import 'server-only'
import type { Connection } from '@prisma/client'
import { currentWorkspaceId, prisma } from '@/lib/prisma'
import { canSeal, openFields, sealFields, type Fields } from '@/lib/secrets'
import { mailboxesChanged } from '@/lib/sync/mailboxes-changed'
import type { CheckAnswer, ConnectorDefinition } from './types'

/** A connection as a member or an assistant sees it: never its credentials. */
export type ConnectionView = Omit<Connection, 'sealedCredentials'>

export type ConnectorAnswer = { ok: true; note?: string } | { ok: false; error: string }

const LONGEST_FIELD = 4000

/** A member can't act on the install's key, so this names no variable: the docs tell whoever runs it. */
export const CANT_STORE = "This install can't store credentials yet: ask whoever runs it to set up its secrets key."

const CANT_OPEN = "These credentials can't be opened, since the install's secrets key has changed. Connect it again."

// Everything here goes through the tenant client: a connection is only ever read in its own workspace.

export const connectionViews = (): Promise<ConnectionView[]> => prisma.connection.findMany({ omit: { sealedCredentials: true } })

export const connectionOf = (kind: string): Promise<ConnectionView | null> => prisma.connection.findFirst({ where: { kind }, omit: { sealedCredentials: true } })

/** Whether this workspace can use the connector now. One marked failing isn't used until it checks out again. */
export const isConnected = async (kind: string) => Boolean(await prisma.connection.findFirst({ where: { kind, status: 'CONNECTED' }, select: { id: true } }))

/** All the fields of a connector this workspace can use now, its credentials opened; null when it can't. */
export async function connectedFields(kind: string): Promise<Fields | null> {
  const row = await prisma.connection.findFirst({ where: { kind, status: 'CONNECTED' } })
  return row && fieldsOf(row)
}

const fieldsOf = (row: Pick<Connection, 'sealedCredentials' | 'settings'>): Fields => ({ ...(row.settings as Fields), ...openFields(row.sealedCredentials) })

type ReadFields = { values: Fields; missing: string[] }

/** Only what the connector asks for, trimmed: anything else a form or a caller sends goes no further. */
function readFields(connector: ConnectorDefinition, typed: Record<string, unknown>): ReadFields {
  const values: Fields = {}
  const missing: string[] = []
  for (const { key, label } of connector.fields) {
    const value = typeof typed[key] === 'string' ? typed[key].trim().slice(0, LONGEST_FIELD) : ''
    if (value) values[key] = value
    else missing.push(label)
  }
  return { values, missing }
}

/** A service down is an answer to give, and whatever it threw isn't: it could hold what it was sent. */
async function tryCredentials(connector: ConnectorDefinition, fields: Fields): Promise<CheckAnswer> {
  try {
    return await connector.check(fields)
  } catch {
    return { ok: false, reason: `${connector.name} didn't answer: try again in a moment.`, unreachable: true }
  }
}

function sealedAndPlain(connector: ConnectorDefinition, values: Fields) {
  const isSecret = new Set(connector.fields.filter(({ secret }) => secret).map(({ key }) => key))
  const entries = Object.entries(values)
  return { sealedCredentials: sealFields(Object.fromEntries(entries.filter(([key]) => isSecret.has(key)))), settings: Object.fromEntries(entries.filter(([key]) => !isSecret.has(key))) }
}

/**
 * Connects a service from what a member typed: tried against the service first, so a wrong key is said
 * at once rather than at the first use, and nothing is saved until it passes. Typing it again replaces it.
 */
export async function connectWith(connector: ConnectorDefinition, typed: Record<string, unknown>, connectedBy: string): Promise<ConnectorAnswer> {
  if (!canSeal()) return { ok: false, error: CANT_STORE }
  const { values, missing } = readFields(connector, typed)
  if (missing.length > 0) return { ok: false, error: `Fill in: ${missing.join(', ')}.` }
  const tried = await tryCredentials(connector, values)
  if (!tried.ok) return { ok: false, error: tried.reason }
  const data = { ...sealedAndPlain(connector, values), status: 'CONNECTED' as const, lastError: null, checkedAt: new Date(), connectedBy }
  const workspaceId = await currentWorkspaceId()
  await prisma.connection.upsert({ where: { workspaceId_kind: { workspaceId, kind: connector.kind } }, create: { workspaceId, kind: connector.kind, ...data }, update: data })
  mailboxesChanged()
  return { ok: true, note: tried.note }
}

function savedFields(row: Connection): Fields | null {
  try {
    return fieldsOf(row)
  } catch {
    return null
  }
}

/** Asks the service again and records the answer. No answer changes nothing: it says nothing about the credentials. */
export async function checkConnection(connector: ConnectorDefinition): Promise<ConnectorAnswer> {
  const row = await prisma.connection.findFirst({ where: { kind: connector.kind } })
  if (!row) return { ok: false, error: `${connector.name} isn't connected in this workspace.` }
  const fields = savedFields(row)
  const tried: CheckAnswer = fields ? await tryCredentials(connector, fields) : { ok: false, reason: CANT_OPEN }
  if (!tried.ok && tried.unreachable) return { ok: false, error: tried.reason }
  await prisma.connection.update({ where: { id: row.id }, data: { status: tried.ok ? 'CONNECTED' : 'FAILING', lastError: tried.ok ? null : tried.reason, checkedAt: new Date() } })
  mailboxesChanged()
  return tried.ok ? { ok: true, note: tried.note } : { ok: false, error: tried.reason }
}

/** Forgets a connection and its credentials. What it brought in stays. */
export async function disconnectConnection(kind: string): Promise<void> {
  await prisma.connection.deleteMany({ where: { kind } })
  mailboxesChanged()
}

/** A service refused the credentials while they were being used: nothing uses them until someone looks. */
export async function markFailing(kind: string, reason: string): Promise<void> {
  await prisma.connection.updateMany({ where: { kind }, data: { status: 'FAILING', lastError: reason } })
  mailboxesChanged()
}
