import 'server-only'
import { sha256 } from '@/lib/hash'
import { prisma } from '@/lib/prisma'
import { newApiKeyToken } from './key-token'

const LONGEST_NAME = 100
const PREFIX_LENGTH = 11

/** How many requests a key may make per window, and how long a window lasts. */
export const REQUESTS_PER_WINDOW = 120
export const WINDOW_SECONDS = 60

/** A new key for another app, in the current workspace. Only its hash is kept, so this is the one time it is seen. */
export async function createApiKey(name: string): Promise<{ id: string; key: string }> {
  const key = newApiKeyToken()
  const { id } = await prisma.apiKey.create({
    data: { name: name.trim().slice(0, LONGEST_NAME) || 'API key', keyHash: sha256(key), prefix: key.slice(0, PREFIX_LENGTH) },
    select: { id: true },
  })
  return { id, key }
}

/** The current workspace's keys for its settings page, newest first, without their hashes. */
export const listApiKeys = () => prisma.apiKey.findMany({ orderBy: { createdAt: 'desc' }, select: { id: true, name: true, prefix: true, scopes: true, lastUsedAt: true, revokedAt: true, createdAt: true } })

export type ListedApiKey = Awaited<ReturnType<typeof listApiKeys>>[number]

/** Ends a key at its next request. The row stays, so the list still says who had access. */
export async function revokeApiKey(id: string): Promise<void> {
  await prisma.apiKey.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } })
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
