'use server'

import { requireSeat } from '@/lib/workspaces/seat'
import { createKeyAs, revokeKeyAs } from './key-management'

// For someone at the screen, in the workspace their browser is in. An assistant's tools come to the same place with their member's role: lib/mcp/key-tools.ts.

/** Returns the key once: only its hash is stored. */
export async function createApiKeyOfWorkspace(name: string): Promise<{ key: string }> {
  const { workspace } = await requireSeat()
  const { key } = await createKeyAs(workspace.role, name)
  return { key }
}

export async function revokeApiKeyOfWorkspace(id: string): Promise<void> {
  const { workspace } = await requireSeat()
  await revokeKeyAs(workspace.role, id)
}
