import 'server-only'
import { revalidatePath } from 'next/cache'
import type { MemberRole } from '@prisma/client'
import { managesApiKeys } from '@/lib/workspaces/roles'
import { createApiKey, listApiKeys, revokeApiKey } from './keys'

// The one way to a workspace's keys, for the screen and for an assistant's tools alike. Each says who
// asks: the role, in the workspace this call is bound to, is checked here so that no door can forget it.

const SETTINGS = '/settings'
const NOT_ALLOWED = 'Only owners and admins manage API keys.'

function requireKeyManager(role: MemberRole | undefined) {
  if (!managesApiKeys(role)) throw new Error(NOT_ALLOWED)
}

export async function listKeysAs(role: MemberRole | undefined) {
  requireKeyManager(role)
  return listApiKeys()
}

/** Returns the key once: only its hash is stored. It can only read, and nothing here asks what it may do. It ends with whoever made it, so a key with nobody behind it isn't made. */
export async function createKeyAs(role: MemberRole | undefined, madeBy: string | undefined, name: string) {
  requireKeyManager(role)
  if (!madeBy) throw new Error(NOT_ALLOWED)
  const made = await createApiKey(name, madeBy)
  revalidatePath(SETTINGS)
  return made
}

/** Says whether this ended a key of the workspace: one already ended, or another workspace's, gets the same no. */
export async function revokeKeyAs(role: MemberRole | undefined, id: string): Promise<boolean> {
  requireKeyManager(role)
  const ended = await revokeApiKey(id)
  revalidatePath(SETTINGS)
  return ended
}
