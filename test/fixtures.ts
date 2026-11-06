import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, it } from 'vitest'
import { prisma, runInWorkspace } from '@/lib/prisma'
import { sealFields, type Fields } from '@/lib/secrets'
import { trustedPrisma } from '@/lib/trusted-prisma'

/** A bare workspace, with none of a new one's defaults, so a test's rows are the only ones in it. */
export const createBareWorkspace = (tag: string) => trustedPrisma.workspace.create({ data: { name: `Workspace ${tag}`, slug: `${tag}-${randomUUID().slice(0, 8)}` } })

/** Removing a workspace takes everything in it along, so a test leaves a database as it found it. */
export const removeWorkspace = (id: string) => trustedPrisma.workspace.delete({ where: { id } })

/** A workspace for the whole of a test file: created before its tests, gone after them. Its `it` runs a test inside it. */
export function workspaceForFile(tag: string) {
  const workspace = {
    id: '',
    run: <T>(work: () => Promise<T>) => runInWorkspace(workspace.id, work),
    it: (name: string, test: () => Promise<unknown>) => it(name, () => workspace.run(test)),
  }
  beforeAll(async () => {
    workspace.id = (await createBareWorkspace(tag)).id
  })
  afterAll(() => removeWorkspace(workspace.id))
  return workspace
}

/** Stages of a test's own, so it runs on a database with migrations alone. In the current workspace. */
export async function createStages(tag: string) {
  const open = await prisma.stage.create({ data: { name: `Open ${tag}`, kind: 'OPEN', position: 1000 } })
  const won = await prisma.stage.create({ data: { name: `Won ${tag}`, kind: 'WON', position: 1001 } })
  return { open, won }
}

/** A verified account, as one that went through sign-up. */
export const createUser = (email: string, name = 'Camille') => trustedPrisma.user.create({ data: { id: randomUUID(), email, name, emailVerified: true } })

export const removeUsers = (emailEnding: string) => trustedPrisma.user.deleteMany({ where: { email: { endsWith: emailEnding } } })

/** A connector as saving one leaves it, with no service asked. In the current workspace. */
export const connectStandIn = (kind: string, secrets: Fields, settings: Fields = {}) => prisma.connection.create({ data: { kind, sealedCredentials: sealFields(secrets), settings, connectedBy: 'owner@acme.example' } })

/** This workspace's own Resend account, as far as a test can tell. In the current workspace. */
export const connectMailStandIn = (apiKey = 'workspace-key', sender = 'Quotes <quotes@acme.example>') => connectStandIn('resend', { apiKey }, { sender })
