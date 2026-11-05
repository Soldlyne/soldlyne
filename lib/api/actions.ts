'use server'

import { revalidatePath } from 'next/cache'
import { managesApiKeys } from '@/lib/workspaces/roles'
import { requireSeat } from '@/lib/workspaces/seat'
import { createApiKey, revokeApiKey } from './keys'

// Only here, for someone at the screen: no assistant tool reaches any of this, so nothing written in a record can hand out access.

const SETTINGS = '/settings'
const NOT_ALLOWED = 'Only owners and admins manage API keys.'

async function requireKeyManager() {
  const { workspace } = await requireSeat()
  if (!managesApiKeys(workspace.role)) throw new Error(NOT_ALLOWED)
}

/** Returns the key once: only its hash is stored. */
export async function createApiKeyOfWorkspace(name: string): Promise<{ key: string }> {
  await requireKeyManager()
  const { key } = await createApiKey(name)
  revalidatePath(SETTINGS)
  return { key }
}

export async function revokeApiKeyOfWorkspace(id: string): Promise<void> {
  await requireKeyManager()
  await revokeApiKey(id)
  revalidatePath(SETTINGS)
}
