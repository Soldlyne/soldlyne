'use server'

import { requireSeat } from '@/lib/workspaces/seat'
import { createHandoverKeyAs, createKeyAs, revokeKeyAs } from './key-management'

// For someone at the screen, in the workspace their browser is in. An assistant's tools come to the same place with their member's role: lib/mcp/key-tools.ts.

/** Returns the key once: only its hash is stored. */
export async function createApiKeyOfWorkspace(name: string): Promise<{ key: string }> {
  const { user, workspace } = await requireSeat()
  const { key } = await createKeyAs(workspace.role, user.id, name)
  return { key }
}

/** Returns the key once. A key for a prospecting tool: it hands people over and says who is off limits, and does nothing else. */
export async function createHandoverKeyOfWorkspace(name: string, productId: string): Promise<{ key: string }> {
  const { user, workspace } = await requireSeat()
  const { key } = await createHandoverKeyAs(workspace.role, user.id, name, productId)
  return { key }
}

export async function revokeApiKeyOfWorkspace(id: string): Promise<void> {
  const { workspace } = await requireSeat()
  await revokeKeyAs(workspace.role, id)
}
