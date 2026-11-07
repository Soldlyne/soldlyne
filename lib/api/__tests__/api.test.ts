import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { createStages, workspaceForFile } from '@/test/fixtures'

const { prisma } = await import('@/lib/prisma')
const { trustedPrisma } = await import('@/lib/trusted-prisma')
const { createApiKey, listApiKeys, REQUESTS_PER_WINDOW, revokeApiKey, takeRequest, WINDOW_SECONDS } = await import('../keys')
const { GET: deals } = await import('@/app/api/v1/deals/route')
const { GET: companies } = await import('@/app/api/v1/companies/route')
const { GET: stages } = await import('@/app/api/v1/stages/route')
const { GET: products } = await import('@/app/api/v1/products/route')
const { GET: workspaceOfKey } = await import('@/app/api/v1/workspace/route')

const workspace = workspaceForFile('api')

type Handler = (request: Request) => Promise<Response>
const get = (handler: Handler, key: string, query = '') => handler(new Request(`http://localhost:3100/api/v1/list${query}`, { headers: { authorization: `Bearer ${key}` } }))
const read = async (handler: Handler, key: string, query = '') => {
  const response = await get(handler, key, query)
  expect(response.status).toBe(200)
  return response.json()
}

let key = ''
let keyId = ''
let open = { id: '', name: '' }
let won = { id: '', name: '' }
let product = ''
let project = ''
let company = ''
let contact = ''

beforeAll(() =>
  workspace.run(async () => {
    ;({ key, id: keyId } = await createApiKey('Reader', null))
    const made = await createStages(randomUUID().slice(0, 6))
    open = made.open
    won = made.won
    project = (await prisma.project.create({ data: { name: `Brand ${randomUUID().slice(0, 6)}` } })).id
    product = (await prisma.product.create({ data: { name: 'Audit', projectId: project } })).id
    company = (await prisma.company.create({ data: { name: 'Northwind', domain: `${randomUUID().slice(0, 8)}.example`, city: 'Lyon' } })).id
    contact = (await prisma.person.create({ data: { firstName: 'Camille', lastName: 'Roy', emails: ['camille@northwind.example'], companyId: company } })).id
  }),
)

const newDeal = (data: { name: string; amount?: bigint; probability?: number }) => workspace.run(() => prisma.deal.create({ data: { productId: product, stageId: open.id, companyId: company, contactId: contact, ...data } }))

describe('a key', () => {
  workspace.it('is kept as a hash and a prefix alone, and listed without either secret', async () => {
    const stored = await prisma.apiKey.findUniqueOrThrow({ where: { id: keyId } })
    expect(stored.keyHash).not.toContain(key)
    expect(key.startsWith(stored.prefix)).toBe(true)
    expect(stored.prefix.length).toBeLessThan(key.length / 2)
    expect(stored.scopes).toEqual(['read'])
    const [listed] = await listApiKeys()
    expect(listed).not.toHaveProperty('keyHash')
  })

  it('opens the workspace it was made in, and records when', async () => {
    expect(await read(workspaceOfKey, key)).toEqual({ id: workspace.id, name: expect.stringContaining('Workspace'), handoverVersion: 2 })
    const stored = await workspace.run(() => prisma.apiKey.findUniqueOrThrow({ where: { id: keyId } }))
    expect(stored.lastUsedAt).toBeInstanceOf(Date)
  })

  it('ends at its next request once revoked', async () => {
    const { key: other, id } = await workspace.run(() => createApiKey('Short-lived', null))
    expect((await get(deals, other)).status).toBe(200)
    await workspace.run(() => revokeApiKey(id))
    const response = await get(deals, other)
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toBe('Bearer')
    const stored = await workspace.run(() => prisma.apiKey.findUniqueOrThrow({ where: { id } }))
    expect(stored.revokedAt).toBeInstanceOf(Date)
  })

  it("is refused when the install's secret was replaced", async () => {
    const { key: other } = await workspace.run(() => createApiKey('Old secret', null))
    const secret = process.env.BETTER_AUTH_SECRET
    process.env.BETTER_AUTH_SECRET = 'another secret entirely'
    try {
      expect((await get(deals, other)).status).toBe(401)
    } finally {
      process.env.BETTER_AUTH_SECRET = secret
    }
  })

  it('is refused without the read scope', async () => {
    const { key: other, id } = await workspace.run(() => createApiKey('No scope', null))
    await workspace.run(() => prisma.apiKey.update({ where: { id }, data: { scopes: [] } }))
    expect((await get(deals, other)).status).toBe(403)
  })
})

describe('the rate limit', () => {
  it('stops a key at the limit, with when to come back, and leaves other keys alone', async () => {
    const { key: busy, id } = await workspace.run(() => createApiKey('Busy', null))
    await workspace.run(() => prisma.apiKey.update({ where: { id }, data: { windowCount: REQUESTS_PER_WINDOW, windowStartedAt: new Date() } }))
    const refused = await get(deals, busy)
    expect(refused.status).toBe(429)
    expect(refused.headers.get('retry-after')).toBe(String(WINDOW_SECONDS))
    expect((await get(deals, key)).status).toBe(200)
  })

  workspace.it('lets exactly the limit through among requests at once, and opens a new window once this one is over', async () => {
    const { id } = await createApiKey('Racing', null)
    await prisma.apiKey.update({ where: { id }, data: { windowCount: REQUESTS_PER_WINDOW - 3, windowStartedAt: new Date() } })
    const answers = await Promise.all(Array.from({ length: 6 }, () => takeRequest(id)))
    expect(answers.filter(Boolean)).toHaveLength(3)
    await prisma.apiKey.update({ where: { id }, data: { windowStartedAt: new Date(Date.now() - (WINDOW_SECONDS + 1) * 1000) } })
    const opened = await Promise.all(Array.from({ length: 4 }, () => takeRequest(id)))
    expect(opened).toEqual([true, true, true, true])
    expect((await prisma.apiKey.findUniqueOrThrow({ where: { id } })).windowCount).toBe(4)
  })
})

describe('reading deals', () => {
  it('gives what a reader needs of a deal, with the exact amount and a link to it', async () => {
    const deal = await newDeal({ name: 'Shape', amount: BigInt('1234567890123456789'), probability: 35 })
    await workspace.run(() => prisma.deal.update({ where: { id: deal.id }, data: { closeDate: new Date('2026-12-01T00:00:00Z'), source: 'REFERRAL' } }))
    const { data } = await read(deals, key, '?limit=200')
    expect(data.find((row: { id: string }) => row.id === deal.id)).toEqual({
      id: deal.id,
      name: 'Shape',
      stage: { id: open.id, name: open.name, kind: 'OPEN' },
      product: { id: product, name: 'Audit' },
      project: { id: project, name: expect.stringContaining('Brand') },
      companyId: company,
      contact: { name: 'Camille Roy', email: 'camille@northwind.example' },
      amountMinor: '1234567890123456789',
      currency: 'EUR',
      probability: 35,
      closeDate: '2026-12-01',
      closedAt: null,
      source: 'REFERRAL',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      deleted: false,
      deletedAt: null,
      url: `http://localhost:3100/deals/${deal.id}`,
    })
  })

  it("falls back on its stage's probability, and hides a deleted contact", async () => {
    const person = await workspace.run(() => prisma.person.create({ data: { firstName: 'Gone', emails: ['gone@northwind.example'] } }))
    const deal = await workspace.run(() => prisma.deal.create({ data: { name: 'No override', productId: product, stageId: won.id, contactId: person.id } }))
    await workspace.run(() => prisma.stage.update({ where: { id: won.id }, data: { probability: 90 } }))
    await workspace.run(() => prisma.person.update({ where: { id: person.id }, data: { deletedAt: new Date() } }))
    const { data } = await read(deals, key, '?limit=200')
    expect(data.find((row: { id: string }) => row.id === deal.id)).toMatchObject({ probability: 90, contact: null, stage: { kind: 'WON' } })
  })

  it('goes through every deal once, a page at a time', async () => {
    for (const name of ['Page 1', 'Page 2', 'Page 3']) await newDeal({ name })
    const total = await workspace.run(() => prisma.deal.count())
    const seen: string[] = []
    let cursor: string | null = null
    do {
      const page: { data: { id: string }[]; nextCursor: string | null } = await read(deals, key, `?limit=2${cursor ? `&cursor=${cursor}` : ''}`)
      expect(page.data.length).toBeLessThanOrEqual(2)
      seen.push(...page.data.map((row) => row.id))
      cursor = page.nextCursor
    } while (cursor)
    expect(seen).toHaveLength(total)
    expect(new Set(seen).size).toBe(total)
  })

  it('from updatedSince on, gives only what changed', async () => {
    const old = await newDeal({ name: 'Unchanged' })
    const since = new Date().toISOString()
    const changed = await newDeal({ name: 'New since' })
    const { data } = await read(deals, key, `?updatedSince=${encodeURIComponent(since)}&limit=200`)
    const ids = data.map((row: { id: string }) => row.id)
    expect(ids).toContain(changed.id)
    expect(ids).not.toContain(old.id)
  })

  it.each([
    ['its stage is renamed', () => workspace.run(() => prisma.stage.update({ where: { id: open.id }, data: { name: `Renamed ${randomUUID().slice(0, 6)}` } }))],
    ['its product is renamed', () => workspace.run(() => prisma.product.update({ where: { id: product }, data: { name: 'Audit plus' } }))],
    ['its project is renamed', () => workspace.run(() => prisma.project.update({ where: { id: project }, data: { name: `Brand ${randomUUID().slice(0, 6)}` } }))],
    ['its contact is renamed', () => workspace.run(() => prisma.person.update({ where: { id: contact }, data: { lastName: 'Roux' } }))],
  ])('counts a deal as changed when %s, since a reader holds those names', async (_what, change) => {
    const deal = await newDeal({ name: 'Linked' })
    await new Promise((resolve) => setTimeout(resolve, 5))
    const since = new Date().toISOString()
    await new Promise((resolve) => setTimeout(resolve, 5))
    const before = await read(deals, key, `?updatedSince=${encodeURIComponent(since)}&limit=200`)
    expect(before.data.map((row: { id: string }) => row.id)).not.toContain(deal.id)
    await change()
    const after = await read(deals, key, `?updatedSince=${encodeURIComponent(since)}&limit=200`)
    expect(after.data.map((row: { id: string }) => row.id)).toContain(deal.id)
  })

  it('marks a deleted deal as deleted, deleted alone or in bulk, so a reader can remove it', async () => {
    const alone = await newDeal({ name: 'Deleted alone' })
    const bulk = await newDeal({ name: 'Deleted in bulk' })
    const since = new Date(Date.now() - 1000).toISOString()
    await workspace.run(() => prisma.deal.update({ where: { id: alone.id }, data: { deletedAt: new Date() } }))
    await workspace.run(() => prisma.deal.updateMany({ where: { id: bulk.id }, data: { deletedAt: new Date() } }))
    const { data } = await read(deals, key, `?updatedSince=${encodeURIComponent(since)}&limit=200`)
    for (const id of [alone.id, bulk.id]) expect(data.find((row: { id: string }) => row.id === id)).toMatchObject({ deleted: true, deletedAt: expect.any(String) })
  })

  it('stays behind the clock in asOf, so what is still committing shows up in the next read', async () => {
    const { asOf } = await read(deals, key)
    expect(Date.now() - new Date(asOf).getTime()).toBeGreaterThanOrEqual(60_000)
  })

  it.each(['?limit=0', '?limit=201', '?limit=many', '?updatedSince=yesterday'])('answers %s with a 400 that says why', async (query) => {
    const response = await get(deals, key, query)
    expect(response.status).toBe(400)
    expect((await response.json()).error).toBeTruthy()
  })
})

describe('reading the rest', () => {
  it('gives companies, deleted ones marked', async () => {
    const gone = await workspace.run(() => prisma.company.create({ data: { name: 'Gone', domain: `${randomUUID().slice(0, 8)}.example`, deletedAt: new Date() } }))
    const { data } = await read(companies, key, '?limit=200')
    expect(data.find((row: { id: string }) => row.id === company)).toMatchObject({ name: 'Northwind', city: 'Lyon', deleted: false, url: `http://localhost:3100/companies/${company}` })
    expect(data.find((row: { id: string }) => row.id === gone.id)).toMatchObject({ deleted: true })
  })

  it('gives stages with their kind and order', async () => {
    const { data } = await read(stages, key, '?limit=200')
    expect(data.find((row: { id: string }) => row.id === won.id)).toMatchObject({ kind: 'WON', position: expect.any(Number) })
  })

  it("gives products with their project, and counts one as changed when its project is", async () => {
    const { data } = await read(products, key, '?limit=200')
    expect(data.find((row: { id: string }) => row.id === product)).toMatchObject({ project: { id: project, archived: false }, archived: false })
    const since = new Date(Date.now() + 1).toISOString()
    await new Promise((resolve) => setTimeout(resolve, 5))
    await workspace.run(() => prisma.project.update({ where: { id: project }, data: { archived: true } }))
    const changed = await read(products, key, `?updatedSince=${encodeURIComponent(since)}&limit=200`)
    expect(changed.data.map((row: { id: string }) => row.id)).toContain(product)
    await workspace.run(() => prisma.project.update({ where: { id: project }, data: { archived: false } }))
  })

  it('offers reading alone: no route takes a write', async () => {
    const routes = await Promise.all([import('@/app/api/v1/deals/route'), import('@/app/api/v1/companies/route'), import('@/app/api/v1/stages/route'), import('@/app/api/v1/products/route'), import('@/app/api/v1/workspace/route')])
    for (const route of routes) expect(Object.keys(route)).toEqual(['GET'])
  })
})

describe('the trusted lookup', () => {
  it('finds a key by its hash alone', async () => {
    const stored = await workspace.run(() => prisma.apiKey.findUniqueOrThrow({ where: { id: keyId } }))
    expect(await trustedPrisma.apiKey.findUnique({ where: { keyHash: stored.keyHash } })).toMatchObject({ workspaceId: workspace.id })
  })
})
