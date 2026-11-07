import 'server-only'
import { z } from 'zod'
import { runInWorkspace } from '@/lib/prisma'
import { findLiveApiKey, type KeyHolder } from './key-lookup'
import { isSignedApiKey } from './key-token'
import { HANDOVER_VERSION, handOver, handoverSchema, NoOpenStageError, PersonDeletedError } from './handover'
import { HANDOVER_SCOPE, READ_SCOPE, takeRequest, WINDOW_SECONDS } from './keys'
import type { ListPage, ListQuery } from './reads'

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

const CANT: Record<string, string> = { [READ_SCOPE]: "This key can't read.", [HANDOVER_SCOPE]: "This key can't hand anyone over." }

/**
 * A request from whoever holds a key of the workspace that may do this, bound to that workspace. What
 * isn't a key the install signed stops at the signature: no query, no sign-in code, so a bot wakes nothing.
 */
function keyed(scopes: readonly string[], work: (holder: KeyHolder, request: Request) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    const key = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
    if (!isSignedApiKey(key)) return NO_KEY()
    const holder = await findLiveApiKey(key)
    if (!holder) return NO_KEY()
    if (!holder.scopes.some((scope) => scopes.includes(scope))) return refusal(403, CANT[scopes[0]])
    return runInWorkspace(holder.workspace.id, async () => {
      if (!(await takeRequest(holder.id))) return refusal(429, 'Too many requests for this key: try again shortly.', { 'retry-after': String(WINDOW_SECONDS) })
      return work(holder, request)
    })
  }
}

const issuesIn = (error: z.ZodError) => error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')

/** A paged list, read as the key's workspace. */
export function listRoute<T>(readPage: (query: ListQuery) => Promise<ListPage<T>>, scope = READ_SCOPE) {
  return keyed([scope], async (_holder, request) => {
    const query = listQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!query.success) return refusal(400, issuesIn(query.error))
    return answer(await readPage(query.data))
  })
}

/** Which workspace a key opens: what a reader knows it by when the key is replaced, and how a connection names itself. It also says which handover this install speaks, so a tool can refuse one that would restore people. */
export const workspaceRoute = () => keyed([READ_SCOPE, HANDOVER_SCOPE], async ({ workspace }) => answer({ ...workspace, handoverVersion: HANDOVER_VERSION }))

/** Someone handed over by another app, on the product the key was made for. */
export const handoverRoute = () =>
  keyed([HANDOVER_SCOPE], async ({ productId }, request) => {
    if (!productId) return refusal(409, "The product this key opens deals on is gone: make a new key in Settings.")
    const input = handoverSchema.safeParse(await request.json().catch(() => null))
    if (!input.success) return refusal(400, issuesIn(input.error))
    try {
      const handedOver = await handOver(productId, input.data)
      return Response.json(handedOver, { status: handedOver.created ? 201 : 200, headers: { 'cache-control': 'no-store' } })
    } catch (error) {
      if (error instanceof NoOpenStageError || error instanceof PersonDeletedError) return refusal(409, error.message)
      throw error
    }
  })
