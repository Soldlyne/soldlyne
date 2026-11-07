import { beforeAll, describe, expect, vi } from 'vitest'
import { createStages, workspaceForFile } from '@/test/fixtures'

const sentMail = vi.hoisted(() => vi.fn())
vi.mock('@/lib/mail', () => ({ sendMail: sentMail, sendOwnMail: sentMail }))

const { prisma } = await import('@/lib/prisma')
const { createApiKey, createHandoverKey } = await import('../keys')
const { POST: handover } = await import('@/app/api/v1/handovers/route')
const { GET: doNotProspect } = await import('@/app/api/v1/do-not-prospect/route')
const { GET: deals } = await import('@/app/api/v1/deals/route')
const { GET: workspaceOfKey } = await import('@/app/api/v1/workspace/route')

const workspace = workspaceForFile('handover')
const ADDRESS = 'http://localhost:3100/api/v1/handovers'

let key = ''
let readKey = ''
let productId = ''
let otherProductId = ''
let wonStage = ''
let lostStage = ''

beforeAll(() =>
  workspace.run(async () => {
    const stages = await createStages('handover')
    wonStage = stages.won.id
    lostStage = (await prisma.stage.create({ data: { name: 'Lost handover', kind: 'LOST', position: 1002 } })).id
    productId = (await prisma.product.create({ data: { name: 'Audit' } })).id
    otherProductId = (await prisma.product.create({ data: { name: 'Training' } })).id
    ;({ key } = await createHandoverKey('For the prospecting app', null, productId))
    ;({ key: readKey } = await createApiKey('Reader', null))
  }),
)

const post = (body: unknown, withKey = key) => handover(new Request(ADDRESS, { method: 'POST', headers: { authorization: `Bearer ${withKey}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }))

async function handedOver(body: unknown, withKey = key) {
  const response = await post(body, withKey)
  expect(response.status).toBeLessThan(300)
  return { status: response.status, ...(await response.json()) }
}

let serial = 0

/** Someone with an address and a company nobody has seen. */
function stranger(overrides: { person?: object; company?: object; note?: string; source?: string } = {}) {
  serial += 1
  return {
    company: { name: `Acme ${serial}`, website: `https://www.acme-${serial}.example/contact`, siren: String(100000000 + serial), ...overrides.company },
    person: { firstName: 'Ada', lastName: `Martin ${serial}`, email: `ada@acme-${serial}.example`, phone: '+33612345678', jobTitle: 'CEO', ...overrides.person },
    ...(overrides.note === undefined ? { note: `Replied: ${serial}` } : { note: overrides.note }),
    source: overrides.source ?? 'EMAIL',
  }
}

const countsFor = async (dealId: string) => ({ notes: await prisma.note.count({ where: { dealId } }), tasks: await prisma.task.count({ where: { dealId } }) })

describe('handing someone over', () => {
  workspace.it('makes a company, a person and a deal on the key\'s product, in the first open stage', async () => {
    const given = stranger()
    const made = await handedOver(given)
    expect(made.status).toBe(201)
    const deal = await prisma.deal.findUniqueOrThrow({ where: { id: made.dealId }, include: { stage: true, company: true, contact: true } })
    expect(deal).toMatchObject({ productId, source: 'EMAIL', createdBy: 'SYNC', name: given.company.name })
    expect(deal.stage.kind).toBe('OPEN')
    expect(deal.company).toMatchObject({ id: made.companyId, name: given.company.name, domain: `acme-${serial}.example`, custom: { siren: given.company.siren } })
    expect(deal.contact).toMatchObject({ id: made.personId, firstName: 'Ada', emails: [given.person.email], phones: ['+33612345678'], jobTitle: 'CEO' })
    expect(await countsFor(made.dealId)).toEqual({ notes: 1, tasks: 1 })
  })

  workspace.it('adds nothing on a repeat: same records, no second note, no second task', async () => {
    const given = stranger()
    const first = await handedOver(given)
    const again = await handedOver(given)
    expect(again.status).toBe(200)
    expect([again.companyId, again.personId, again.dealId]).toEqual([first.companyId, first.personId, first.dealId])
    expect(await countsFor(first.dealId)).toEqual({ notes: 1, tasks: 1 })
    expect(await prisma.company.count({ where: { name: given.company.name } })).toBe(1)
  })

  workspace.it('makes one of each when the same person arrives twice at once', async () => {
    const given = stranger()
    const [one, two] = await Promise.all([handedOver(given), handedOver(given)])
    expect(two.dealId).toBe(one.dealId)
    expect(two.personId).toBe(one.personId)
    expect(await countsFor(one.dealId)).toEqual({ notes: 1, tasks: 1 })
  })

  workspace.it('adds what is new to the same deal, with a task, since someone has to answer', async () => {
    const given = stranger()
    const first = await handedOver(given)
    const second = await handedOver({ ...given, note: 'Replied again: next week' })
    expect(second.dealId).toBe(first.dealId)
    expect(await countsFor(first.dealId)).toEqual({ notes: 2, tasks: 2 })
  })

  workspace.it('finds someone without an address by their name at the company, and a colleague lands on the same deal', async () => {
    const given = stranger({ person: { email: undefined } })
    const first = await handedOver(given)
    const again = await handedOver(given)
    expect(again.personId).toBe(first.personId)
    const colleague = await handedOver({ ...given, person: { lastName: 'Durand', email: `bob@acme-${serial}.example` } })
    expect(colleague.companyId).toBe(first.companyId)
    expect(colleague.personId).not.toBe(first.personId)
    expect(colleague.dealId).toBe(first.dealId)
  })

  workspace.it('never takes a mail provider for a company: two people there stay two companies', async () => {
    const one = await handedOver(stranger({ company: { website: undefined }, person: { email: `one-${serial}@gmail.com` } }))
    const two = await handedOver(stranger({ company: { website: undefined }, person: { email: `two-${serial}@gmail.com` } }))
    expect(two.companyId).not.toBe(one.companyId)
    expect((await prisma.company.findUniqueOrThrow({ where: { id: one.companyId } })).domain).toBeNull()
  })

  workspace.it('completes what a record lacks and never overwrites what a member wrote', async () => {
    const given = stranger()
    const company = await prisma.company.create({ data: { name: 'Their spelling', domain: `acme-${serial}.example` } })
    const person = await prisma.person.create({ data: { firstName: 'Adèle', lastName: 'Written by hand', emails: [given.person.email], jobTitle: 'Founder', companyId: company.id } })
    const made = await handedOver(given)
    expect([made.companyId, made.personId]).toEqual([company.id, person.id])
    expect(await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).toMatchObject({ name: 'Their spelling', custom: { siren: given.company.siren } })
    expect(await prisma.person.findUniqueOrThrow({ where: { id: person.id } })).toMatchObject({ firstName: 'Adèle', lastName: 'Written by hand', jobTitle: 'Founder', phones: ['+33612345678'] })
  })

  workspace.it('finds a company by its SIREN even when its name and site have changed', async () => {
    const given = stranger()
    const first = await handedOver(given)
    const renamed = await handedOver({ ...given, company: { ...given.company, name: 'New name', website: 'https://new.example' }, person: { lastName: 'Other' } })
    expect(renamed.companyId).toBe(first.companyId)
  })

  workspace.it("doesn't reopen a closed deal: it gets the note and a task, and a member decides", async () => {
    const given = stranger()
    const first = await handedOver(given)
    await prisma.deal.update({ where: { id: first.dealId }, data: { stageId: lostStage } })
    const again = await handedOver({ ...given, note: 'Back, months later' })
    expect(again).toMatchObject({ status: 200, dealId: first.dealId })
    expect((await prisma.deal.findUniqueOrThrow({ where: { id: first.dealId }, include: { stage: true } })).stage.kind).toBe('LOST')
    expect(await countsFor(first.dealId)).toEqual({ notes: 2, tasks: 2 })
  })

  workspace.it('prefers the open deal, and leaves a deal on another product alone', async () => {
    const given = stranger()
    const company = await prisma.company.create({ data: { name: given.company.name, domain: `acme-${serial}.example` } })
    const open = (await prisma.stage.findFirstOrThrow({ where: { kind: 'OPEN' } })).id
    const other = await prisma.deal.create({ data: { name: 'Elsewhere', productId: otherProductId, stageId: open, companyId: company.id } })
    const made = await handedOver(given)
    expect(made.dealId).not.toBe(other.id)
    expect((await prisma.deal.findUniqueOrThrow({ where: { id: made.dealId } })).productId).toBe(productId)
  })

  workspace.it('contacts nobody', async () => {
    await handedOver(stranger())
    expect(sentMail).not.toHaveBeenCalled()
    expect(await prisma.activity.count({ where: { direction: 'OUTBOUND' } })).toBe(0)
    expect(await prisma.quote.count()).toBe(0)
  })

  workspace.it('says what is wrong with what it was given', async () => {
    expect((await post({ company: { name: '' }, person: { lastName: 'x' } })).status).toBe(400)
    expect((await post({ company: { name: 'x' }, person: {} })).status).toBe(400)
    const unreadable = await handover(new Request(ADDRESS, { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: 'not json' }))
    expect(unreadable.status).toBe(400)
  })

  workspace.it('says so when the key\'s product is gone', async () => {
    const product = await prisma.product.create({ data: { name: 'Going away' } })
    const { key: orphan } = await createHandoverKey('Orphan', null, product.id)
    await prisma.product.delete({ where: { id: product.id } })
    const response = await post(stranger(), orphan)
    expect(response.status).toBe(409)
    expect((await response.json()).error).toContain('product')
  })
})

describe('someone deleted in Soldlyne', () => {
  const recordCounts = async () => ({ companies: await prisma.company.count(), people: await prisma.person.count(), deals: await prisma.deal.count(), notes: await prisma.note.count(), tasks: await prisma.task.count(), events: await prisma.timelineEvent.count() })

  const refusedAsDeleted = async (body: unknown) => {
    const response = await post(body)
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'person_deleted' })
  }

  workspace.it('stays deleted when they reply: refused, nothing written, not even a new company', async () => {
    const given = stranger()
    const person = await prisma.person.create({ data: { firstName: 'Ada', lastName: 'Gone', emails: [given.person.email], deletedAt: new Date('2026-11-01') } })
    const before = await recordCounts()
    await refusedAsDeleted(given)
    expect(await recordCounts()).toEqual(before)
    expect((await prisma.person.findUniqueOrThrow({ where: { id: person.id } })).deletedAt).toEqual(new Date('2026-11-01'))
    expect(await prisma.company.findFirst({ where: { name: given.company.name } })).toBeNull()
  })

  workspace.it('stays deleted when found by name at their company', async () => {
    const given = stranger({ person: { email: undefined } })
    const company = await prisma.company.create({ data: { name: given.company.name } })
    await prisma.person.create({ data: { firstName: 'Ada', lastName: given.person.lastName, companyId: company.id, deletedAt: new Date() } })
    await refusedAsDeleted(given)
  })

  workspace.it('stays deleted when they arrive with neither company nor last name', async () => {
    const email = `gone-${Date.now()}@acme-gone.example`
    await prisma.person.create({ data: { lastName: 'Gone', emails: [email], deletedAt: new Date() } })
    await refusedAsDeleted({ person: { email } })
  })

  workspace.it("doesn't stop someone live who holds the same address", async () => {
    const given = stranger()
    await prisma.person.create({ data: { lastName: 'Gone', emails: [given.person.email], deletedAt: new Date() } })
    const live = await prisma.person.create({ data: { lastName: 'Live', emails: [given.person.email] } })
    expect((await handedOver(given)).personId).toBe(live.id)
  })
})

describe('a company deleted in Soldlyne', () => {
  workspace.it('stays deleted and gets nothing attached: a new one is made without its domain, once', async () => {
    const given = stranger()
    const domain = `acme-${serial}.example`
    const gone = await prisma.company.create({ data: { name: 'Old name', domain, deletedAt: new Date('2026-11-01') } })
    const made = await handedOver(given)
    expect(made.companyId).not.toBe(gone.id)
    expect(await prisma.company.findUniqueOrThrow({ where: { id: made.companyId } })).toMatchObject({ name: given.company.name, domain: null })
    expect(await prisma.company.findUniqueOrThrow({ where: { id: gone.id } })).toMatchObject({ domain, deletedAt: new Date('2026-11-01') })
    expect(await prisma.person.count({ where: { companyId: gone.id } })).toBe(0)
    expect(await prisma.deal.count({ where: { companyId: gone.id } })).toBe(0)
    expect((await handedOver(given)).companyId).toBe(made.companyId)
  })

  workspace.it("isn't found by its SIREN or its name either", async () => {
    const given = stranger()
    const gone = await prisma.company.create({ data: { name: given.company.name, custom: { siren: given.company.siren }, deletedAt: new Date() } })
    const made = await handedOver(given)
    expect(made.companyId).not.toBe(gone.id)
    expect((await prisma.company.findUniqueOrThrow({ where: { id: gone.id } })).deletedAt).not.toBeNull()
  })

  workspace.it("isn't what someone with no company given lands on: they have none", async () => {
    const domain = `gone-${Date.now()}.example`
    await prisma.company.create({ data: { name: 'Gone', domain, deletedAt: new Date() } })
    expect((await handedOver({ person: { email: `ada@${domain}` } })).companyId).toBeNull()
  })

  workspace.it("isn't what someone already there brings a deal to", async () => {
    const domain = `kept-${Date.now()}.example`
    const gone = await prisma.company.create({ data: { name: 'Gone', domain: `other-${domain}`, deletedAt: new Date() } })
    const email = `ada@${domain}`
    await prisma.person.create({ data: { lastName: 'Martin', emails: [email], companyId: gone.id } })
    const made = await handedOver({ person: { email } })
    expect(made.companyId).toBeNull()
    expect((await prisma.deal.findUniqueOrThrow({ where: { id: made.dealId } })).companyId).toBeNull()
  })
})

describe('someone with no company or no last name, as who books a meeting often is', () => {
  workspace.it('lands on the company their address names, and makes none', async () => {
    const domain = `known-${Date.now()}.example`
    const company = await prisma.company.create({ data: { name: 'Known', domain } })
    const before = await prisma.company.count()
    const made = await handedOver({ person: { email: `ada@${domain}` } })
    expect(made.companyId).toBe(company.id)
    expect(await prisma.company.count()).toBe(before)
    expect(await prisma.deal.findUniqueOrThrow({ where: { id: made.dealId } })).toMatchObject({ companyId: company.id, name: 'Known' })
  })

  workspace.it('makes no company for an address nobody knows, or a mail provider\'s, and adds nothing to it on a repeat', async () => {
    for (const email of [`ada-${Date.now()}@unknown-${Date.now()}.example`, `ada-${Date.now()}@gmail.com`]) {
      const before = await prisma.company.count()
      const made = await handedOver({ person: { email, firstName: 'Ada' }, note: 'Booked' })
      expect(made.status).toBe(201)
      expect(made.companyId).toBeNull()
      expect(await prisma.company.count()).toBe(before)
      const again = await handedOver({ person: { email, firstName: 'Ada' }, note: 'Booked' })
      expect(again).toMatchObject({ status: 200, personId: made.personId, dealId: made.dealId, companyId: null })
      expect(await countsFor(made.dealId)).toEqual({ notes: 1, tasks: 1 })
    }
  })

  workspace.it('names the deal and the task after who they are, and invents nothing', async () => {
    const email = `only-${Date.now()}@gmail.com`
    const anonymous = await handedOver({ person: { email } })
    expect(await prisma.deal.findUniqueOrThrow({ where: { id: anonymous.dealId } })).toMatchObject({ name: email, companyId: null })
    expect(await prisma.person.findUniqueOrThrow({ where: { id: anonymous.personId } })).toMatchObject({ firstName: '', lastName: '', emails: [email] })
    expect((await prisma.task.findFirstOrThrow({ where: { dealId: anonymous.dealId } })).title).toBe(`Follow up: ${email}`)
    const named = await handedOver({ person: { firstName: 'Ada', lastName: `Named ${Date.now()}` } })
    const person = await prisma.person.findUniqueOrThrow({ where: { id: named.personId } })
    expect((await prisma.deal.findUniqueOrThrow({ where: { id: named.dealId } })).name).toBe(`Ada ${person.lastName}`)
  })

  workspace.it('looks no one up by name without a company: a namesake is someone else', async () => {
    const lastName = `Namesake ${Date.now()}`
    const first = await handedOver({ person: { lastName } })
    const second = await handedOver({ person: { lastName } })
    expect(second.personId).not.toBe(first.personId)
  })

  workspace.it('needs an address or a last name', async () => {
    expect((await post({ person: { firstName: 'Ada' } })).status).toBe(400)
    expect((await post({ person: {} })).status).toBe(400)
    expect((await post({})).status).toBe(400)
  })
})

describe('a retry key', () => {
  const base = () => stranger({ note: 'Booked for Thursday' })

  workspace.it('keeps a retry to one note and one task, whatever its words', async () => {
    const given = base()
    const key = `booking-${Date.now()}`
    const first = await handedOver({ ...given, retryKey: key })
    const again = await handedOver({ ...given, retryKey: key, note: 'Booked for Thursday at 10' })
    expect(again.dealId).toBe(first.dealId)
    expect(await countsFor(first.dealId)).toEqual({ notes: 1, tasks: 1 })
  })

  workspace.it('lets a new key say the same words again: it is a new event', async () => {
    const given = base()
    const first = await handedOver({ ...given, retryKey: `one-${Date.now()}` })
    await handedOver({ ...given, retryKey: `two-${Date.now()}` })
    expect(await countsFor(first.dealId)).toEqual({ notes: 2, tasks: 2 })
  })

  workspace.it('is matched on its own, and leaves a repeat without one to its words', async () => {
    const given = base()
    const first = await handedOver(given)
    await handedOver(given)
    expect(await countsFor(first.dealId)).toEqual({ notes: 1, tasks: 1 })
  })

  workspace.it('is held once by the database itself', async () => {
    const key = `unique-${Date.now()}`
    await prisma.note.create({ data: { body: 'One', retryKey: key } })
    await expect(prisma.note.create({ data: { body: 'Two', retryKey: key } })).rejects.toThrow()
    await prisma.note.create({ data: { body: 'No key' } })
    await prisma.note.create({ data: { body: 'No key either' } })
  })

  workspace.it('has a length limit', async () => {
    expect((await post({ ...base(), retryKey: 'x'.repeat(201) })).status).toBe(400)
  })
})

describe('which handover an install speaks', () => {
  workspace.it('says so on the workspace route, to any key', async () => {
    for (const withKey of [key, readKey]) {
      const answer = await (await workspaceOfKey(new Request('http://localhost:3100/api/v1/workspace', { headers: { authorization: `Bearer ${withKey}` } }))).json()
      expect(answer).toMatchObject({ id: workspace.id, handoverVersion: 2 })
    }
  })
})

describe('what a handover key opens', () => {
  const get = (route: (request: Request) => Promise<Response>, withKey: string) => route(new Request('http://localhost:3100/api/v1/x', { headers: { authorization: `Bearer ${withKey}` } }))

  workspace.it('hands over and says who is off limits, and reads no pipeline', async () => {
    expect((await get(deals, key)).status).toBe(403)
    expect((await get(doNotProspect, key)).status).toBe(200)
    expect(await (await get(workspaceOfKey, key)).json()).toEqual({ id: workspace.id, name: expect.stringContaining('Workspace'), handoverVersion: 2 })
  })

  workspace.it("is its own: a read key can't hand over, and can't read who is off limits", async () => {
    expect((await post(stranger(), readKey)).status).toBe(403)
    expect((await get(doNotProspect, readKey)).status).toBe(403)
  })

  workspace.it('stops at the signature when it is no key', async () => {
    expect((await post(stranger(), 'sl_made-up')).status).toBe(401)
    expect((await get(doNotProspect, 'sl_made-up')).status).toBe(401)
  })
})

describe('who is off limits', () => {
  type Entry = { why: string; company: { name: string; domain: string | null; siren: string | null } | null; people: { emails: string[]; phones: string[]; linkedinUrl: string | null }[] }

  async function offLimits(): Promise<Entry[]> {
    const entries: Entry[] = []
    let cursor = ''
    do {
      const response = await doNotProspect(new Request(`http://localhost:3100/api/v1/do-not-prospect?limit=200${cursor ? `&cursor=${cursor}` : ''}`, { headers: { authorization: `Bearer ${key}` } }))
      const page = await response.json()
      entries.push(...page.data)
      cursor = page.nextCursor ?? ''
    } while (cursor)
    return entries
  }

  const entryOf = async (name: string) => (await offLimits()).find((entry) => entry.company?.name === name)

  async function dealAt(tag: string, stage: 'open' | 'won' | 'lost', extra: { deleted?: boolean; domain?: string } = {}) {
    const company = await prisma.company.create({ data: { name: tag, domain: extra.domain ?? `${tag}.example`, custom: { siren: '123456789' } } })
    const contact = await prisma.person.create({ data: { lastName: 'Contact', emails: [`contact@${tag}.example`, `second@${tag}.example`], phones: ['06 12 34 56 78'], linkedinUrl: `https://linkedin.com/in/${tag}`, companyId: company.id } })
    await prisma.person.create({ data: { lastName: 'Colleague', emails: [`colleague@${tag}.example`], companyId: company.id } })
    await prisma.person.create({ data: { lastName: 'Gone', emails: [`gone@${tag}.example`], companyId: company.id, deletedAt: new Date() } })
    const stageId = stage === 'won' ? wonStage : stage === 'lost' ? lostStage : (await prisma.stage.findFirstOrThrow({ where: { kind: 'OPEN' } })).id
    return prisma.deal.create({ data: { name: tag, productId, stageId, companyId: company.id, contactId: contact.id, amount: BigInt(123456), deletedAt: extra.deleted ? new Date() : null } })
  }

  workspace.it('holds open deals and customers, with what identifies them', async () => {
    await dealAt('open-one', 'open')
    await dealAt('won-one', 'won')
    expect(await entryOf('open-one')).toMatchObject({ why: 'open_deal', company: { domain: 'open-one.example', siren: '123456789' } })
    const customer = await entryOf('won-one')
    expect(customer?.why).toBe('customer')
    expect(customer?.people.flatMap(({ emails }) => emails)).toEqual(expect.arrayContaining(['contact@won-one.example', 'second@won-one.example', 'colleague@won-one.example']))
    expect(customer?.people.flatMap(({ phones }) => phones)).toContain('06 12 34 56 78')
    expect(customer?.people.map(({ linkedinUrl }) => linkedinUrl)).toContain('https://linkedin.com/in/won-one')
  })

  workspace.it('leaves out someone deleted, a lost deal and a deleted deal', async () => {
    await dealAt('lost-one', 'lost')
    await dealAt('deleted-one', 'open', { deleted: true })
    await dealAt('with-gone', 'open')
    expect(await entryOf('lost-one')).toBeUndefined()
    expect(await entryOf('deleted-one')).toBeUndefined()
    expect((await entryOf('with-gone'))?.people.flatMap(({ emails }) => emails)).not.toContain('gone@with-gone.example')
  })

  workspace.it('never lists a mail provider as a company: it would stop everyone there', async () => {
    await dealAt('on-gmail', 'open', { domain: 'gmail.com' })
    expect((await entryOf('on-gmail'))?.company?.domain).toBeNull()
  })

  workspace.it('gives nothing about the deal itself: not its amount, name or stage', async () => {
    await dealAt('quiet', 'open')
    const entry = await entryOf('quiet')
    expect(Object.keys(entry!).sort()).toEqual(['company', 'people', 'why'])
    expect(JSON.stringify(entry)).not.toContain('123456"')
  })
})
