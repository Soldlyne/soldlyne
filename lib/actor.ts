import 'server-only'
import { AsyncLocalStorage } from 'node:async_hooks'
import type { Actor } from '@prisma/client'
import { getSession } from './session'

/**
 * Who is acting: the signed-in user (session cookie) or an assistant through
 * the MCP endpoint (OAuth token, set by withMcpActor). Server actions call
 * requireActor() so the same code serves the UI and MCP tools, and records
 * the right actor.
 */
// One per process: each of Next's server bundles loads its own copy of this module.
const globalForActor = globalThis as unknown as { mcpActor?: AsyncLocalStorage<{ actor: Actor; tokenId: string }> }
const store = (globalForActor.mcpActor ??= new AsyncLocalStorage())

export function withMcpActor<T>(tokenId: string, fn: () => Promise<T>): Promise<T> {
  return store.run({ actor: 'MCP', tokenId }, fn)
}

export function currentActor(): Actor {
  return store.getStore()?.actor ?? 'USER'
}

export async function requireActor(): Promise<Actor> {
  const mcp = store.getStore()
  if (mcp) return mcp.actor
  if (!(await getSession())) throw new Error('Not signed in')
  return 'USER'
}
