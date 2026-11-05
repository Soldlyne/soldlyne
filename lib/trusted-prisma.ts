import 'server-only'
import { PrismaClient, type Prisma } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { attachDatabasePool } from '@vercel/functions/db-connections'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

/** The role a workspace's data is read and written as: it can't bypass row-level security. */
const APP_ROLE = 'soldlyne_app'

function connectionString(): string {
  const url = process.env.DATABASE_URL
  // `next build` imports modules that touch Prisma without querying it.
  if (!url && process.env.NEXT_PHASE === 'phase-production-build') {
    return 'postgresql://build:build@localhost:5432/build'
  }
  if (!url) throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.')
  return url
}

function createPrismaClient(): PrismaClient {
  const url = connectionString()
  const host = new URL(url).hostname
  const pool = new Pool({
    // node-postgres does not parse these query params; TLS is set explicitly.
    connectionString: url.replace(/([?&])(sslmode|channel_binding)=[^&]*/g, '$1').replace(/[?&]+$/, ''),
    ssl: LOCAL_HOSTS.has(host) ? false : { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: process.env.VERCEL ? 5_000 : 30_000,
    // Neon takes a few seconds to wake up after scaling to zero.
    connectionTimeoutMillis: 15_000,
    allowExitOnIdle: true,
  })
  pool.on('error', (error) => console.warn('Postgres pool client error:', error.message))
  // Keeps a Fluid Compute instance alive until idle clients are closed.
  if (process.env.VERCEL) attachDatabasePool(pool)
  // Every tenant operation is a transaction, and Prisma's default wait of 2 s to open one is shorter than the database's wake-up.
  return new PrismaClient({ adapter: new PrismaPg(pool), transactionOptions: { maxWait: 15_000, timeout: 30_000 } })
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

/** The connection itself, created on first use, so importing this module needs no database. */
export function databaseClient(): PrismaClient {
  globalForPrisma.prisma ??= createPrismaClient()
  return globalForPrisma.prisma
}

/**
 * The client that is NOT bound to a workspace. Business data goes through `prisma` in lib/prisma.ts,
 * which fails closed; this one is for what comes before a workspace is known or lies outside any.
 * Each file that imports it says why, and test/isolation/trusted-uses.test.ts holds the short list.
 */
export const trustedPrisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = databaseClient()
    const value = Reflect.get(client, property)
    return typeof value === 'function' ? value.bind(client) : value
  },
})

/**
 * Puts one transaction in a workspace, as the app role: `SET LOCAL ROLE` and the workspace, as one
 * statement. Both last until the transaction ends, so a pooled connection never carries them on.
 * Row-level security then limits every later statement in it to that workspace's rows.
 */
export const asWorkspace = (client: Pick<Prisma.TransactionClient, '$executeRaw'>, workspaceId: string) =>
  client.$executeRaw`SELECT set_config('app.workspace_id', ${workspaceId}, true), set_config('role', ${APP_ROLE}, true)`
