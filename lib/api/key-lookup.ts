import 'server-only'
import { sha256 } from '@/lib/hash'
import { trustedPrisma } from '@/lib/trusted-prisma'
import { isSignedApiKey } from './key-token'

export type KeyHolder = { id: string; scopes: string[]; workspace: { id: string; name: string } }

/**
 * The live key this secret opens, with its workspace, or null. Trusted: the key is what says which
 * workspace a read is for, and everything after this is bound to it. A key the install didn't sign never gets here.
 */
export async function findLiveApiKey(key: string): Promise<KeyHolder | null> {
  if (!isSignedApiKey(key)) return null
  const row = await trustedPrisma.apiKey.findUnique({
    where: { keyHash: sha256(key) },
    select: { id: true, scopes: true, revokedAt: true, workspace: { select: { id: true, name: true } } },
  })
  return row && !row.revokedAt ? { id: row.id, scopes: row.scopes, workspace: row.workspace } : null
}
