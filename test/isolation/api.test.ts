import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createBareWorkspace, removeWorkspace } from '@/test/fixtures'

const { prisma, runInWorkspace } = await import('@/lib/prisma')
const { createApiKey, createHandoverKey, revokeApiKey } = await import('@/lib/api/keys')
const { POST: handover } = await import('@/app/api/v1/handovers/route')
const { GET: doNotProspect } = await import('@/app/api/v1/do-not-prospect/route')
const { GET: deals } = await import('@/app/api/v1/deals/route')
const { GET: companies } = await import('@/app/api/v1/companies/route')
const { GET: stages } = await import('@/app/api/v1/stages/route')
const { GET: products } = await import('@/app/api/v1/products/route')
const { GET: workspaceOfKey } = await import('@/app/api/v1/workspace/route')

type Handler = (request: Request) => Promise<Response>

/** A workspace with one of everything the API reads, and a key to it. */
async function workspaceWithRecords(tag: string) {
  const id = (await createBareWorkspace(tag)).id
  const unique = randomUUID().slice(0, 8)
  return runInWorkspace(id, async () => {
    const stage = await prisma.stage.create({ data: { name: `Stage ${tag}` } })
    const project = await prisma.project.create({ data: { name: `Project ${unique}` } })
    const product = await prisma.product.create({ data: { name: `Product ${tag}`, projectId: project.id } })
    const company = await prisma.company.create({ data: { name: `Company ${tag}`, domain: `${unique}.example` } })
    const deal = await prisma.deal.create({ data: { name: `Deal ${tag}`, productId: product.id, stageId: stage.id, companyId: company.id } })
    const { key, id: keyId } = await createApiKey(`Key ${tag}`, null)
    return { id, key, keyId, rows: { stage: stage.id, product: product.id, company: company.id, deal: deal.id } }
  })
}

const read = async (handler: Handler, key: string, query = '') => {
  const response = await handler(new Request(`http://localhost:3100/api/v1/list${query}`, { headers: { authorization: `Bearer ${key}` } }))
  expect(response.status).toBe(200)
  return (await response.json()) as { data: { id: string }[]; nextCursor: string | null }
}

const ROUTES: [string, Handler, 'deal' | 'company' | 'stage' | 'product'][] = [
  ['deals', deals, 'deal'],
  ['companies', companies, 'company'],
  ['stages', stages, 'stage'],
  ['products', products, 'product'],
]

let a: Awaited<ReturnType<typeof workspaceWithRecords>>
let b: Awaited<ReturnType<typeof workspaceWithRecords>>

beforeAll(async () => {
  a = await workspaceWithRecords('api-isolation-a')
  b = await workspaceWithRecords('api-isolation-b')
})

afterAll(async () => {
  await removeWorkspace(a.id)
  await removeWorkspace(b.id)
})

describe("a key of workspace A, with records in A and B", () => {
  it.each(ROUTES)("%s: reads A's and never B's", async (_name, handler, row) => {
    const { data } = await read(handler, a.key, '?limit=200')
    const ids = data.map(({ id }) => id)
    expect(ids).toContain(a.rows[row])
    expect(ids).not.toContain(b.rows[row])
  })

  it.each(ROUTES)("%s: B's key reads B's and never A's", async (_name, handler, row) => {
    const ids = (await read(handler, b.key, '?limit=200')).data.map(({ id }) => id)
    expect(ids).toContain(b.rows[row])
    expect(ids).not.toContain(a.rows[row])
  })

  it.each(ROUTES)("%s: a cursor pointing into B doesn't open it", async (_name, handler, row) => {
    const ids = (await read(handler, a.key, `?limit=200&cursor=${encodeURIComponent(b.rows[row])}`)).data.map(({ id }) => id)
    expect(ids).not.toContain(b.rows[row])
  })

  it("a handover key's records stay in its workspace, and each sees only its own off limits", async () => {
    const made = async (workspaceId: string, tag: string) => {
      const product = await runInWorkspace(workspaceId, () => prisma.product.create({ data: { name: `Handed over ${tag}` } }))
      await runInWorkspace(workspaceId, () => prisma.stage.create({ data: { name: `Open ${tag}`, kind: 'OPEN', position: 2000 } }))
      return (await runInWorkspace(workspaceId, () => createHandoverKey(`Handover ${tag}`, null, product.id))).key
    }
    const [keyA, keyB] = [await made(a.id, 'a'), await made(b.id, 'b')]
    const body = JSON.stringify({ company: { name: 'Same company', website: 'https://same-company.example' }, person: { lastName: 'Same', email: 'same@same-company.example' } })
    const post = (key: string) => handover(new Request('http://localhost:3100/api/v1/handovers', { method: 'POST', headers: { authorization: `Bearer ${key}` }, body }))
    const [inA, inB] = [await (await post(keyA)).json(), await (await post(keyB)).json()]
    expect(inA.dealId).not.toBe(inB.dealId)
    expect(inA.companyId).not.toBe(inB.companyId)
    expect(await runInWorkspace(a.id, () => prisma.deal.findUnique({ where: { id: inB.dealId } }))).toBeNull()
    const seenBy = async (key: string) => (await (await doNotProspect(new Request('http://localhost:3100/api/v1/do-not-prospect?limit=200', { headers: { authorization: `Bearer ${key}` } }))).json()) as { data: { company: { name: string } | null }[] }
    expect((await seenBy(keyA)).data.filter(({ company }) => company?.name === 'Same company')).toHaveLength(1)
    await runInWorkspace(b.id, () => prisma.deal.delete({ where: { id: inB.dealId } }))
    expect((await seenBy(keyB)).data.filter(({ company }) => company?.name === 'Same company')).toEqual([])
    expect((await seenBy(keyA)).data.filter(({ company }) => company?.name === 'Same company')).toHaveLength(1)
  })

  it('a retry key can be the same in A and B', async () => {
    for (const id of [a.id, b.id]) await runInWorkspace(id, () => prisma.note.create({ data: { body: 'Same key', retryKey: 'the-same-key' } }))
  })

  it('says it opens A, and nothing of B', async () => {
    const response = await workspaceOfKey(new Request('http://localhost:3100/api/v1/workspace', { headers: { authorization: `Bearer ${a.key}` } }))
    expect(await response.json()).toEqual({ id: a.id, name: expect.stringContaining('api-isolation-a'), handoverVersion: 2 })
  })

  it("can't be revoked from B, and revoking it leaves B's key working", async () => {
    await runInWorkspace(b.id, () => revokeApiKey(a.keyId))
    expect((await read(deals, a.key)).data.length).toBeGreaterThan(0)
    const other = await runInWorkspace(a.id, () => createApiKey('Revoked in A', null))
    await runInWorkspace(a.id, () => revokeApiKey(other.id))
    expect((await read(deals, b.key)).data.length).toBeGreaterThan(0)
  })

  it("can't be counted or listed from B", async () => {
    const seenFromB = await runInWorkspace(b.id, () => prisma.apiKey.findMany())
    expect(seenFromB.map(({ id }) => id)).not.toContain(a.keyId)
  })
})
