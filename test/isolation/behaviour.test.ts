import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Client } from 'pg'
import { createBareWorkspace, removeWorkspace } from '@/test/fixtures'
import { TRUSTED_MODELS, tenantModels } from './schema'

const { NoWorkspaceError, prisma, runInWorkspace } = await import('@/lib/prisma')
const { trustedPrisma } = await import('@/lib/trusted-prisma')

const unique = () => randomUUID().slice(0, 12)

type Delegate = Record<string, (args?: object) => Promise<never>>
const delegate = (model: string) => (prisma as unknown as Record<string, Delegate>)[model[0].toLowerCase() + model.slice(1)]
const asAny = (client: unknown, model: string) => (client as Record<string, Delegate>)[model[0].toLowerCase() + model.slice(1)]

/** One row of every tenant model, all linked to one another. */
async function createEveryModel() {
  const tag = unique()
  const entity = await prisma.entity.create({ data: { name: `Entity ${tag}` } })
  const project = await prisma.project.create({ data: { name: `Project ${tag}`, entityId: entity.id } })
  const product = await prisma.product.create({ data: { name: `Product ${tag}`, projectId: project.id } })
  const stage = await prisma.stage.create({ data: { name: `Stage ${tag}` } })
  const customField = await prisma.customField.create({ data: { object: 'COMPANY', key: `key_${tag}`, label: 'Label', type: 'TEXT' } })
  const view = await prisma.view.create({ data: { object: 'COMPANY', name: `View ${tag}` } })
  const company = await prisma.company.create({ data: { name: `Company ${tag}`, domain: `${tag}.example` } })
  const person = await prisma.person.create({ data: { firstName: 'Camille', emails: [`camille@${tag}.example`], companyId: company.id } })
  const partner = await prisma.partner.create({ data: { name: `Partner ${tag}`, companyId: company.id, contactId: person.id } })
  const deal = await prisma.deal.create({ data: { name: `Deal ${tag}`, productId: product.id, stageId: stage.id, companyId: company.id, contactId: person.id, partnerId: partner.id } })
  const activity = await prisma.activity.create({ data: { type: 'CALL', source: 'MANUAL', externalId: tag, companyId: company.id, dealId: deal.id } })
  const activityParticipant = await prisma.activityParticipant.create({ data: { activityId: activity.id, personId: person.id } })
  const task = await prisma.task.create({ data: { title: `Task ${tag}`, companyId: company.id, personId: person.id, dealId: deal.id } })
  const note = await prisma.note.create({ data: { body: `Note ${tag}`, companyId: company.id, personId: person.id, dealId: deal.id } })
  const timelineEvent = await prisma.timelineEvent.create({ data: { name: 'test', companyId: company.id, personId: person.id, dealId: deal.id } })
  const mailbox = await prisma.mailbox.create({ data: { email: `me@${tag}.example`, displayName: 'Me', refreshToken: 'x' } })
  const leadSource = await prisma.leadSource.create({ data: { name: `Source ${tag}`, keyHash: tag, keyPrefix: 'lead_', productId: product.id } })
  const invitation = await prisma.invitation.create({ data: { email: `someone@${tag}.example`, tokenHash: tag, expiresAt: new Date(Date.now() + 86_400_000) } })
  const sellerDetails = await prisma.sellerDetails.create({ data: { legalName: `Seller ${tag}` } })
  const quoteCounter = await prisma.quoteCounter.create({ data: {} })
  const quote = await prisma.quote.create({ data: { number: 1, reference: '0001', issueDate: new Date(), validUntil: new Date(), tokenHash: tag, dealId: deal.id, companyId: company.id, contactId: person.id } })
  const quoteLine = await prisma.quoteLine.create({ data: { quoteId: quote.id, productId: product.id, position: 0, description: 'Line', quantityMilli: BigInt(1000), unitPriceMinor: BigInt(100), taxRateMilliPercent: 20000, netMinor: BigInt(100) } })
  const connection = await prisma.connection.create({ data: { kind: tag, sealedCredentials: 'x', connectedBy: 'owner@acme.example' } })
  const apiKey = await prisma.apiKey.create({ data: { name: `Key ${tag}`, keyHash: tag, prefix: 'sl_' } })
  return Object.fromEntries(Object.entries({ entity, project, product, stage, customField, view, company, person, partner, deal, activity, activityParticipant, task, note, timelineEvent, mailbox, leadSource, invitation, sellerDetails, quoteCounter, quote, quoteLine, connection, apiKey }).map(([model, { id }]) => [model[0].toUpperCase() + model.slice(1), id])) as Record<string, string>
}

/** A new row with only what each model requires, parents taken from the given rows. */
const NEW_ROW: Record<string, (rows: Record<string, string>) => object> = {
  Entity: () => ({ name: unique() }),
  Project: () => ({ name: unique() }),
  Product: () => ({ name: unique() }),
  Stage: () => ({ name: unique() }),
  CustomField: () => ({ object: 'DEAL', key: unique(), label: 'Label', type: 'TEXT' }),
  View: () => ({ object: 'DEAL', name: unique() }),
  Company: () => ({ name: unique() }),
  Person: () => ({}),
  Partner: () => ({ name: unique() }),
  Deal: (rows) => ({ name: unique(), productId: rows.Product, stageId: rows.Stage }),
  Activity: () => ({ type: 'CALL' }),
  ActivityParticipant: (rows) => ({ activityId: rows.Activity }),
  Task: () => ({ title: unique() }),
  Note: () => ({ body: unique() }),
  TimelineEvent: () => ({ name: unique() }),
  Mailbox: () => ({ email: `${unique()}@example.com`, displayName: 'Me', refreshToken: 'x' }),
  LeadSource: () => ({ name: unique(), keyHash: unique(), keyPrefix: 'lead_' }),
  Invitation: () => ({ email: `${unique()}@example.com`, tokenHash: unique(), expiresAt: new Date() }),
  SellerDetails: () => ({}),
  QuoteCounter: () => ({}),
  Quote: () => ({ number: Math.floor(Math.random() * 1_000_000_000) + 2, reference: unique(), issueDate: new Date(), validUntil: new Date() }),
  QuoteLine: (rows) => ({ quoteId: rows.Quote, position: 1, description: unique(), quantityMilli: BigInt(1000), unitPriceMinor: BigInt(100), taxRateMilliPercent: 20000, netMinor: BigInt(100) }),
  Connection: () => ({ kind: unique(), sealedCredentials: 'x', connectedBy: 'owner@acme.example' }),
  ApiKey: () => ({ name: unique(), keyHash: unique(), prefix: 'sl_' }),
}

/** A workspace holds one of each of these: the row its test adds takes the place of the one already there. */
const ONE_PER_WORKSPACE = ['SellerDetails', 'QuoteCounter']

const models = tenantModels().map(({ name }) => name)
const links = tenantModels().flatMap(({ name, links: own }) => own.filter(({ parent }) => parent !== 'Workspace' && !TRUSTED_MODELS.includes(parent)).map((link) => ({ model: name, ...link })))

let workspaceA = ''
let workspaceB = ''
let rowsA: Record<string, string> = {}
let rowsB: Record<string, string> = {}
const asA = <T>(work: () => Promise<T>) => runInWorkspace(workspaceA, work)
const asB = <T>(work: () => Promise<T>) => runInWorkspace(workspaceB, work)

beforeAll(async () => {
  workspaceA = (await createBareWorkspace('isolation-a')).id
  workspaceB = (await createBareWorkspace('isolation-b')).id
  rowsA = await asA(createEveryModel)
  rowsB = await asB(createEveryModel)
})

afterAll(async () => {
  await removeWorkspace(workspaceA)
  await removeWorkspace(workspaceB)
})

describe('running as workspace A, with rows in A and B for every tenant model', () => {
  it('the test covers every tenant model in the schema', () => {
    expect(Object.keys(rowsB).sort()).toEqual([...models].sort())
    expect(Object.keys(NEW_ROW).sort()).toEqual([...models].sort())
  })

  it.each(models)("%s: B's row can't be read", (model) =>
    asA(async () => {
      expect(await delegate(model).findUnique({ where: { id: rowsB[model] } })).toBeNull()
      expect(await delegate(model).findMany({ where: { id: rowsB[model] } })).toEqual([])
      expect(await delegate(model).count({ where: { id: rowsB[model] } })).toBe(0)
      const everything = (await delegate(model).findMany()) as unknown as { id: string; workspaceId: string }[]
      expect(everything.map(({ id }) => id)).toContain(rowsA[model])
      expect(new Set(everything.map(({ workspaceId }) => workspaceId))).toEqual(new Set([workspaceA]))
    }),
  )

  it.each(models)("%s: B's row can't be updated", (model) =>
    asA(async () => {
      await expect(delegate(model).update({ where: { id: rowsB[model] }, data: { workspaceId: workspaceA } })).rejects.toThrow()
      expect(await delegate(model).updateMany({ where: { id: rowsB[model] }, data: { workspaceId: workspaceA } })).toEqual({ count: 0 })
    }),
  )

  it.each(models)("%s: B's row can't be deleted", (model) =>
    asA(async () => {
      await expect(delegate(model).delete({ where: { id: rowsB[model] } })).rejects.toThrow()
      expect(await delegate(model).deleteMany({ where: { id: rowsB[model] } })).toEqual({ count: 0 })
    }),
  )

  it.each(models)('%s: no row can be written into B, and a row left to its default lands in A', (model) =>
    asA(async () => {
      await expect(delegate(model).create({ data: { ...NEW_ROW[model](rowsA), workspaceId: workspaceB } })).rejects.toThrow()
      await expect(delegate(model).update({ where: { id: rowsA[model] }, data: { workspaceId: workspaceB } })).rejects.toThrow()
      if (ONE_PER_WORKSPACE.includes(model)) await delegate(model).delete({ where: { id: rowsA[model] } })
      const created = (await delegate(model).create({ data: NEW_ROW[model](rowsA) })) as unknown as { id: string; workspaceId: string }
      expect(created.workspaceId).toBe(workspaceA)
      if (ONE_PER_WORKSPACE.includes(model)) rowsA[model] = created.id
      else await delegate(model).delete({ where: { id: created.id } })
    }),
  )

  it.each(links.map(({ model, column, parent }) => [model, column, parent]))("%s.%s can't be linked to B's %s, on an existing row or a new one", (model, column, parent) =>
    asA(async () => {
      await expect(delegate(model).update({ where: { id: rowsA[model] }, data: { [column]: rowsB[parent] } })).rejects.toThrow()
      await expect(delegate(model).create({ data: { ...NEW_ROW[model](rowsA), [column]: rowsB[parent] } })).rejects.toThrow()
    }),
  )

  it.each(models)("%s: B's row is still there, as it was", (model) =>
    asB(async () => {
      const row = (await delegate(model).findUnique({ where: { id: rowsB[model] } })) as unknown as { workspaceId: string }
      expect(row.workspaceId).toBe(workspaceB)
    }),
  )

  it('the same name, domain or address goes in both workspaces, and twice in one is refused', async () => {
    const shared = unique()
    for (const run of [asA, asB]) await run(() => prisma.company.create({ data: { name: shared, domain: `${shared}.example` } }))
    await expect(asA(() => prisma.company.create({ data: { name: 'Again', domain: `${shared}.example` } }))).rejects.toThrow()
  })

  it("a transaction block is bound too: it reads A's rows alone, and rolls back together", () =>
    asA(async () => {
      const seen = await prisma.$transaction((tx) => tx.company.findMany({ select: { id: true } }))
      expect(seen.map(({ id }) => id)).toContain(rowsA.Company)
      expect(seen.map(({ id }) => id)).not.toContain(rowsB.Company)
      const name = unique()
      await expect(
        prisma.$transaction(async (tx) => {
          await tx.company.create({ data: { name } })
          await tx.company.update({ where: { id: rowsB.Company }, data: { name: 'Stolen' } })
        }),
      ).rejects.toThrow()
      expect(await prisma.company.count({ where: { name } })).toBe(0)
    }))

  it("a nested read stays bound: a deal's include can't reach across", () =>
    asA(async () => {
      const deal = await prisma.deal.findUniqueOrThrow({ where: { id: rowsA.Deal }, include: { company: true, contact: true, stage: true, tasks: true, activities: { include: { participants: true } } } })
      expect(deal.company?.workspaceId).toBe(workspaceA)
      expect(deal.tasks.every(({ workspaceId }) => workspaceId === workspaceA)).toBe(true)
    }))
})

describe("across Next's server bundles, each with its own copy of the modules", () => {
  it('a workspace bound in one holds for a client made in another', async () => {
    vi.resetModules()
    const other = await import('@/lib/prisma')
    expect(other.runInWorkspace).not.toBe(runInWorkspace)
    const stages = await other.runInWorkspace(workspaceB, () => prisma.stage.findMany())
    expect(stages.map(({ workspaceId }) => workspaceId)).toEqual([workspaceB])
    expect(await runInWorkspace(workspaceA, () => other.prisma.stage.findFirstOrThrow())).toMatchObject({ workspaceId: workspaceA })
  })
})

describe('with no workspace', () => {
  it('the tenant client throws for every operation rather than running unscoped', async () => {
    for (const model of models) await expect(delegate(model).findMany()).rejects.toBeInstanceOf(NoWorkspaceError)
    await expect(prisma.company.create({ data: { name: unique() } })).rejects.toBeInstanceOf(NoWorkspaceError)
    await expect(prisma.$transaction((tx) => tx.company.count())).rejects.toBeInstanceOf(NoWorkspaceError)
  })

  it('the tenant client offers no raw SQL and nothing else that would run unbound', () => {
    const client = prisma as unknown as Record<string, unknown>
    for (const method of ['$queryRaw', '$executeRaw', '$queryRawUnsafe', '$executeRawUnsafe', '$extends', '$connect', '$disconnect']) expect(() => client[method]).toThrow('outside any workspace')
  })

  it("a row's workspace can't default to nothing on the trusted path", async () => {
    await expect(trustedPrisma.company.create({ data: { name: unique() } })).rejects.toThrow()
  })

  it('the owner gets no business rows unless it bypasses row-level security', async () => {
    const [owner] = await trustedPrisma.$queryRaw<{ bypasses: boolean }[]>`SELECT rolsuper OR rolbypassrls AS bypasses FROM pg_roles WHERE rolname = current_user`
    // A superuser or Neon's owner sees everything here: the tenant client is what holds it to one workspace.
    if (owner.bypasses) return
    expect(await asAny(trustedPrisma, 'Company').count()).toBe(0)
    expect(await asAny(trustedPrisma, 'Deal').count()).toBe(0)
    expect(await asAny(trustedPrisma, 'Mailbox').count()).toBe(0)
    expect(await asAny(trustedPrisma, 'Connection').count()).toBe(0)
  })

  it('only the tables looked up before a workspace is known open to the trusted path', async () => {
    expect(await trustedPrisma.leadSource.findUnique({ where: { keyHash: (await asA(() => prisma.leadSource.findUniqueOrThrow({ where: { id: rowsA.LeadSource } }))).keyHash } })).not.toBeNull()
    expect(await trustedPrisma.invitation.findFirst({ where: { id: rowsB.Invitation } })).not.toBeNull()
    expect(await trustedPrisma.quote.findUnique({ where: { tokenHash: (await asA(() => prisma.quote.findUniqueOrThrow({ where: { id: rowsA.Quote } }))).tokenHash! } })).not.toBeNull()
    expect(await trustedPrisma.apiKey.findUnique({ where: { keyHash: (await asA(() => prisma.apiKey.findUniqueOrThrow({ where: { id: rowsA.ApiKey } }))).keyHash } })).not.toBeNull()
  })

  it('the trusted path can read a quote or an API key to find its workspace, and write nothing to one', async () => {
    const [owner] = await trustedPrisma.$queryRaw<{ bypasses: boolean }[]>`SELECT rolsuper OR rolbypassrls AS bypasses FROM pg_roles WHERE rolname = current_user`
    if (owner.bypasses) return
    expect(await trustedPrisma.quote.updateMany({ where: { id: rowsA.Quote }, data: { reference: 'Stolen' } })).toEqual({ count: 0 })
    expect(await trustedPrisma.apiKey.updateMany({ where: { id: rowsA.ApiKey }, data: { revokedAt: null, scopes: ['write'] } })).toEqual({ count: 0 })
    expect(await trustedPrisma.quoteLine.count()).toBe(0)
    expect(await trustedPrisma.sellerDetails.count()).toBe(0)
  })
})

describe('plain SQL on a real connection', () => {
  let client: Client

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.DATABASE_URL })
    await client.connect()
  })

  afterAll(() => client.end())

  const inTransaction = async <T>(work: () => Promise<T>): Promise<T> => {
    await client.query('BEGIN')
    try {
      return await work()
    } finally {
      await client.query('ROLLBACK')
    }
  }

  it('as the app role with no workspace set, no table holds a row', () =>
    inTransaction(async () => {
      await client.query('SET LOCAL ROLE soldlyne_app')
      for (const model of models) expect((await client.query(`SELECT count(*)::int AS n FROM "${model}"`)).rows[0].n, model).toBe(0)
    }))

  it("as the app role in A, B's rows are out of reach, whatever the WHERE says", () =>
    inTransaction(async () => {
      await client.query('SET LOCAL ROLE soldlyne_app')
      await client.query(`SELECT set_config('app.workspace_id', $1, true)`, [workspaceA])
      for (const model of models) {
        expect((await client.query(`SELECT count(*)::int AS n FROM "${model}" WHERE id = $1`, [rowsB[model]])).rows[0].n, model).toBe(0)
        expect((await client.query(`SELECT count(*)::int AS n FROM "${model}" WHERE "workspaceId" = $1`, [workspaceB])).rows[0].n, model).toBe(0)
      }
      expect((await client.query(`UPDATE "Company" SET name = 'Stolen' WHERE id = $1`, [rowsB.Company])).rowCount).toBe(0)
      expect((await client.query(`DELETE FROM "Company" WHERE id = $1`, [rowsB.Company])).rowCount).toBe(0)
    }))

  it("as the app role, the tables that say who belongs where can't even be read", () =>
    inTransaction(async () => {
      await client.query('SET LOCAL ROLE soldlyne_app')
      await client.query(`SELECT set_config('app.workspace_id', $1, true)`, [workspaceA])
      await expect(client.query('SELECT * FROM "Member"')).rejects.toThrow('permission denied')
    }))
})
