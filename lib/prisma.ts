import 'server-only'
import { AsyncLocalStorage } from 'node:async_hooks'
import type { Prisma, PrismaClient } from '@prisma/client'
import { requireSeat } from './workspaces/seat'
import { asWorkspace, databaseClient } from './trusted-prisma'

/** Raised rather than ever running a business query as the owner: nothing bound a workspace, and this is no request to find one in. */
export class NoWorkspaceError extends Error {
  constructor() {
    super('No workspace: run this inside runInWorkspace, or in a request from a member of one.')
    this.name = 'NoWorkspaceError'
  }
}

const OUTSIDE_A_REQUEST = /outside a request scope/

// One per process, like the client below: each of Next's server bundles loads its own copy of this
// module, and a workspace bound in one has to hold for a client made in another.
const globalForTenant = globalThis as unknown as { boundWorkspace?: AsyncLocalStorage<string>; tenantPrisma?: ReturnType<typeof createTenantClient> }
const boundWorkspace = (globalForTenant.boundWorkspace ??= new AsyncLocalStorage<string>())

/**
 * Runs `work` with every `prisma` operation in this workspace, whatever the request says. For the
 * paths with no browser: lead capture, cron, an assistant's call. Awaited inside: a Prisma operation
 * only starts when it's awaited, and handed back as it is, it would start out here, in the request's workspace.
 */
export const runInWorkspace = <T>(workspaceId: string, work: () => PromiseLike<T>): Promise<T> => boundWorkspace.run(workspaceId, async () => await work())

/** The workspace `runInWorkspace` bound, if any. */
export const boundWorkspaceId = () => boundWorkspace.getStore()

/**
 * The workspace an operation belongs to: the one bound here, otherwise the signed-in member's active
 * one. With neither it throws, whatever happens the operation doesn't run. In a request that throw is
 * Next's redirect to sign in or to /welcome: a page renders beside its layout, so its queries get here
 * even when the layout is already sending the visitor away.
 */
export async function currentWorkspaceId(): Promise<string> {
  const bound = boundWorkspace.getStore()
  if (bound) return bound
  const seat = await requireSeat().catch((error: Error) => {
    throw OUTSIDE_A_REQUEST.test(error.message) ? new NoWorkspaceError() : error
  })
  return seat.workspace.id
}

/**
 * Prisma's documented row-level-security extension: each operation is a batch transaction that binds
 * the workspace first (https://www.prisma.io/docs/orm/prisma-client/client-extensions/query). An
 * operation's own reads, for an `include` say, stay in that transaction, so they are bound too.
 */
function createTenantClient() {
  const client = databaseClient()
  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const workspaceId = await currentWorkspaceId()
          const [, result] = await client.$transaction([asWorkspace(client, workspaceId), query(args) as Prisma.PrismaPromise<unknown>])
          return result
        },
      },
    },
  })
}

function tenantClient() {
  globalForTenant.tenantPrisma ??= createTenantClient()
  return globalForTenant.tenantPrisma
}

/**
 * Several writes that stand or fall together. The extension's batches can't nest in one (Prisma's
 * limit on this kind of extension), so the block gets a transaction client bound once, at its start.
 */
async function workspaceTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const workspaceId = await currentWorkspaceId()
  return databaseClient().$transaction(async (tx) => {
    await asWorkspace(tx, workspaceId)
    return work(tx)
  })
}

/** What lies outside any workspace, for `trustedPrisma` alone: the app role has no grant on these tables. */
type TrustedModels = 'user' | 'session' | 'account' | 'verification' | 'rateLimit' | 'jwks' | 'oauthClient' | 'oauthResource' | 'oauthClientResource' | 'oauthRefreshToken' | 'oauthAccessToken' | 'oauthConsent' | 'oauthClientAssertion' | 'workspace' | 'member'

/** Raw SQL and the lifecycle methods are left out too: they would run unbound. */
type TenantClient = Omit<PrismaClient, `$${string}` | TrustedModels> & { $transaction: typeof workspaceTransaction }

/**
 * The client for all business data. Row-level security does the limiting, so a query that forgets to
 * filter still only sees its workspace, and with no workspace to bind an operation throws: it never
 * falls back to running unscoped as the owner. `trustedPrisma` is the separate, clearly named way out.
 */
export const prisma: TenantClient = new Proxy({} as TenantClient, {
  get(_target, property) {
    if (property === '$transaction') return workspaceTransaction
    if (typeof property === 'string' && property.startsWith('$')) throw new Error(`prisma.${property} would run outside any workspace.`)
    return Reflect.get(tenantClient(), property)
  },
})
