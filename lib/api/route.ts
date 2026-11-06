import 'server-only'
import { z } from 'zod'
import { runInWorkspace } from '@/lib/prisma'
import { findLiveApiKey, type KeyHolder } from './key-lookup'
import { isSignedApiKey } from './key-token'
import { takeRequest, WINDOW_SECONDS } from './keys'
import type { ListPage, ListQuery } from './reads'

const READ_SCOPE = 'read'
const DEFAULT_PAGE = 100
const LARGEST_PAGE = 200

const listQuery = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(LARGEST_PAGE).default(DEFAULT_PAGE),
  updatedSince: z.iso.datetime({ offset: true }).transform((value) => new Date(value)).optional(),
})

const refusal = (status: number, error: string, headers: Record<string, string> = {}) => Response.json({ error }, { status, headers: { 'cache-control': 'no-store', ...headers } })

const NO_KEY = () => refusal(401, 'A valid API key is required: Authorization: Bearer <key>', { 'www-authenticate': 'Bearer' })

const answer = (body: unknown) => Response.json(body, { headers: { 'cache-control': 'no-store' } })

/**
 * A read for whoever holds a key of the workspace, bound to that workspace. What isn't a key the
 * install signed stops at the signature: no query, no sign-in code, so a bot wakes nothing.
 */
function keyedRead(read: (holder: KeyHolder, request: Request) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    const key = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
    if (!isSignedApiKey(key)) return NO_KEY()
    const holder = await findLiveApiKey(key)
    if (!holder) return NO_KEY()
    if (!holder.scopes.includes(READ_SCOPE)) return refusal(403, "This key can't read.")
    return runInWorkspace(holder.workspace.id, async () => {
      if (!(await takeRequest(holder.id))) return refusal(429, 'Too many requests for this key: try again shortly.', { 'retry-after': String(WINDOW_SECONDS) })
      return read(holder, request)
    })
  }
}

/** A paged list, read as the key's workspace. */
export function listRoute<T>(readPage: (query: ListQuery) => Promise<ListPage<T>>) {
  return keyedRead(async (_holder, request) => {
    const query = listQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!query.success) return refusal(400, query.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '))
    return answer(await readPage(query.data))
  })
}

/** Which workspace a key opens: what a reader knows it by when the key is replaced. */
export const workspaceRoute = () => keyedRead(async ({ workspace }) => answer(workspace))
