import 'server-only'
import { sha256 } from '@/lib/hash'
import { prisma } from '@/lib/prisma'
import { newApiKeyToken } from './key-token'

export const LONGEST_KEY_NAME = 100
const PREFIX_LENGTH = 11

/** The one thing a key can do. The read API checks for it, and no other scope exists. */
export const READ_SCOPE = 'read'

/** How many requests a key may make per window, and how long a window lasts. */
export const REQUESTS_PER_WINDOW = 120
export const WINDOW_SECONDS = 60

/** A new key for another app, in the current workspace. Only its hash is kept, so this is the one time it is seen. */
export async function createApiKey(name: string): Promise<{ id: string; name: string; scopes: string[]; key: string }> {
  const key = newApiKeyToken()
  const made = await prisma.apiKey.create({
    data: { name: name.trim().slice(0, LONGEST_KEY_NAME) || 'API key', keyHash: sha256(key), prefix: key.slice(0, PREFIX_LENGTH), scopes: [READ_SCOPE] },
    select: { id: true, name: true, scopes: true },
  })
  return { ...made, key }
}

/** The current workspace's keys for its settings page, newest first, without their hashes. */
export const listApiKeys = () => prisma.apiKey.findMany({ orderBy: { createdAt: 'desc' }, select: { id: true, name: true, prefix: true, scopes: true, lastUsedAt: true, revokedAt: true, createdAt: true } })

export type ListedApiKey = Awaited<ReturnType<typeof listApiKeys>>[number]

/** Ends a key at its next request. The row stays, so the list still says who had access. Says whether this ended one: a key already ended, or another workspace's, is left as it is. */
export async function revokeApiKey(id: string): Promise<boolean> {
  const { count } = await prisma.apiKey.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } })
  return count > 0
}

/**
 * Counts one request against the key, in its workspace, and says whether it may go ahead. Each step
 * is one conditional update, so servers racing on a key can't let more through than the limit. A
 * request that lost the race to open a new window is counted in the window the winner opened.
 */
export async function takeRequest(keyId: string, now = new Date()): Promise<boolean> {
  const windowStart = new Date(now.getTime() - WINDOW_SECONDS * 1000)
  const countIn = () =>
    prisma.apiKey.updateMany({
      where: { id: keyId, windowStartedAt: { gte: windowStart }, windowCount: { lt: REQUESTS_PER_WINDOW } },
      data: { windowCount: { increment: 1 }, lastUsedAt: now },
    })
  if ((await countIn()).count > 0) return true
  const opened = await prisma.apiKey.updateMany({ where: { id: keyId, windowStartedAt: { lt: windowStart } }, data: { windowStartedAt: now, windowCount: 1, lastUsedAt: now } })
  return opened.count > 0 || (await countIn()).count > 0
}
