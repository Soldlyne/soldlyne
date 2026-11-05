import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every file of the app that may reach the database without a workspace, and why. Adding one to this
 * list is a decision to review: anything else goes through `prisma`, which fails closed.
 */
const TRUSTED_USES: Record<string, string> = {
  'lib/prisma.ts': 'the tenant client is built on the same connection, and binds every operation',
  'lib/auth.ts': "Better Auth's own tables, which lie outside any workspace",
  'lib/workspaces/workspaces.ts': 'which workspaces someone belongs to, read to find the one a request is in, and creating one',
  'lib/workspaces/team.ts': 'memberships, which the app role has no grant on',
  'lib/workspaces/invitation-gate.ts': 'the sign-up gate, before any account or workspace is known',
  'lib/workspaces/invitations.ts': "an invitation's link, before its workspace is known, and accepting it with its membership",
  'app/api/leads/route.ts': 'the key is what says which workspace a lead is for',
  'lib/sync/workspaces.ts': 'the list of workspaces the cron walks, each then bound',
  'lib/quotes/link.ts': "a customer's link says which workspace its quote is in, and everything after is bound to it",
  'lib/api/key-lookup.ts': 'an API key says which workspace a read is for, and everything after is bound to it',
}

const ROOT = new URL('../..', import.meta.url).pathname
const SKIPPED = new Set(['node_modules', '.next', '.git', 'test', '__tests__', 'prisma'])

function appFiles(directory: string): string[] {
  return readdirSync(join(ROOT, directory)).flatMap((entry) => {
    if (SKIPPED.has(entry)) return []
    const path = join(directory, entry)
    if (statSync(join(ROOT, path)).isDirectory()) return appFiles(path)
    return /\.tsx?$/.test(entry) ? [path] : []
  })
}

const files = ['app', 'lib', 'components', 'hooks'].flatMap(appFiles).concat('proxy.ts')

describe('the way around the tenant client', () => {
  it('is used only where the list says, and the list has no leftovers', () => {
    const users = files.filter((file) => /trusted-prisma'/.test(readFileSync(join(ROOT, file), 'utf8'))).filter((file) => file !== 'lib/trusted-prisma.ts')
    expect(users.sort()).toEqual(Object.keys(TRUSTED_USES).sort())
  })

  it('nothing else makes a Prisma client of its own', () => {
    const makers = files.filter((file) => /new PrismaClient\(/.test(readFileSync(join(ROOT, file), 'utf8')))
    expect(makers).toEqual(['lib/trusted-prisma.ts'])
  })
})
