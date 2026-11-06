import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { connectMailStandIn, createUser, removeUsers, removeWorkspace } from '@/test/fixtures'
import { mcpClient } from '@/test/mcp-client'
import { createDealFixture, fillSeller, TWO_RATES } from '@/lib/quotes/__tests__/fixtures'

const { prisma, runInWorkspace } = await import('@/lib/prisma')
const { createWorkspace } = await import('@/lib/workspaces/workspaces')

const tag = `quote-tools-${Date.now()}`
const domain = `@${tag}.example`
const ORIGIN = 'http://localhost:3100'
const { clientFor, parsed, tool } = mcpClient(ORIGIN)

let solo = ''
let soloWorkspace = ''
let several = ''
let alpha = ''
let beta = ''
let tagCount = 0

const inSolo = <T>(work: () => Promise<T>) => runInWorkspace(soloWorkspace, work)
const dealInSolo = () => inSolo(() => createDealFixture(`${tag}-${tagCount++}`))

beforeAll(async () => {
  solo = (await createUser(`solo${domain}`)).id
  soloWorkspace = await createWorkspace(solo, 'Solo')
  several = (await createUser(`several${domain}`)).id
  alpha = await createWorkspace(several, 'Alpha')
  beta = await createWorkspace(several, 'Beta')
  await inSolo(fillSeller)
  await runInWorkspace(alpha, fillSeller)
})

afterAll(async () => {
  for (const id of [soloWorkspace, alpha, beta]) await removeWorkspace(id)
  await removeUsers(domain)
})

beforeEach(async () => {
  process.env.BETTER_AUTH_URL = ORIGIN
  process.env.BETTER_AUTH_SECRET = 'a-secret-for-these-tests'
  await inSolo(() => prisma.connection.deleteMany())
  vi.unstubAllGlobals()
})

describe('the tools', () => {
  it('offer no way to accept a quote or change the seller details', async () => {
    const { tools } = await clientFor(solo)('tools/list')
    for (const { name } of tools) expect(name).not.toMatch(/accept|seller|decline/)
    expect(tools.map(({ name }: { name: string }) => name).filter((name: string) => name.includes('quote')).sort()).toEqual(['create_quote', 'list_quotes', 'read_quote', 'send_quote', 'update_quote'])
  })

  it('tell an assistant to send only once the member said yes, there and in the instructions', async () => {
    const { tools } = await clientFor(solo)('tools/list')
    const send = tools.find(({ name }: { name: string }) => name === 'send_quote')
    expect(send.description).toContain('real person')
    expect(send.description).toContain('only after the member has said yes')
    expect(send.annotations.openWorldHint).toBe(true)
    const { instructions } = await clientFor(solo)('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } })
    expect(instructions).toContain('send_quote only once the member has said yes')
  })
})

describe('create_quote', () => {
  it('opens a draft for a deal, with exact totals and tax per rate, recorded as done by MCP', async () => {
    const { deal, contact, company } = await dealInSolo()
    const quote = parsed(await tool(solo, 'create_quote', { dealId: deal.id, lines: TWO_RATES }))
    expect(quote).toMatchObject({ status: 'draft', currency: 'EUR', subtotal: '470.68', tax: '54.89', total: '525.57', company: { id: company.id }, contact: { id: contact.id, email: contact.emails[0] }, url: `${ORIGIN}/quotes/${quote.id}` })
    expect(quote.taxes).toEqual([
      { rate: '5.5%', base: '270.68', tax: '14.89' },
      { rate: '20%', base: '200.00', tax: '40.00' },
    ])
    expect(quote.lines[1]).toMatchObject({ description: 'Training', quantity: '1.5', unitPrice: '200.50', taxRate: '5.5%', discount: '10%', net: '270.68' })
    expect((await inSolo(() => prisma.quote.findUniqueOrThrow({ where: { id: quote.id } }))).createdBy).toBe('MCP')
  })

  it('says plainly what is wrong with a line', async () => {
    const { deal } = await dealInSolo()
    const refused = await tool(solo, 'create_quote', { dealId: deal.id, lines: [{ ...TWO_RATES[0], quantity: 0 }] })
    expect(refused.isError).toBe(true)
    expect(refused.content[0].text).toBe('Line 1: The quantity must be more than zero.')
  })

  it("refuses a deal it can't see", async () => {
    const refused = await tool(solo, 'create_quote', { dealId: 'nothing' })
    expect(refused.isError).toBe(true)
    expect(refused.content[0].text).toBe("This deal doesn't exist.")
  })
})

describe('update_quote', () => {
  it('changes a draft and replaces its lines', async () => {
    const { deal } = await dealInSolo()
    const { id } = parsed(await tool(solo, 'create_quote', { dealId: deal.id, lines: TWO_RATES }))
    const updated = parsed(await tool(solo, 'update_quote', { quoteId: id, notes: 'Thanks', lines: [{ description: 'One thing', quantity: 1, unitPrice: 10, taxRate: 0 }] }))
    expect(updated).toMatchObject({ notes: 'Thanks', total: '10.00' })
    expect(updated.lines).toHaveLength(1)
  })

  it('refuses a sent quote', async () => {
    const { deal } = await dealInSolo()
    const { id } = parsed(await tool(solo, 'create_quote', { dealId: deal.id, lines: TWO_RATES }))
    await tool(solo, 'send_quote', { quoteId: id })
    const refused = await tool(solo, 'update_quote', { quoteId: id, notes: 'Too late' })
    expect(refused.isError).toBe(true)
    expect(refused.content[0].text).toContain("can't be edited")
  })
})

describe('read_quote and list_quotes', () => {
  it('read a quote, and leave out where its customer answered from', async () => {
    const { deal } = await dealInSolo()
    const { id } = parsed(await tool(solo, 'create_quote', { dealId: deal.id, lines: TWO_RATES }))
    await inSolo(() => prisma.quote.update({ where: { id }, data: { status: 'ACCEPTED', acceptedName: 'Ada Martin', acceptedAt: new Date(), acceptedIp: '203.0.113.7', acceptedUserAgent: 'Secret browser' } }))
    const result = await tool(solo, 'read_quote', { quoteId: id })
    expect(parsed(result)).toMatchObject({ status: 'accepted', accepted: { name: 'Ada Martin' } })
    expect(result.content[0].text).not.toContain('203.0.113.7')
    expect(result.content[0].text).not.toContain('Secret browser')
  })

  it('never hand over the hash of the link or the copies of the parties', async () => {
    const { deal } = await dealInSolo()
    const { id } = parsed(await tool(solo, 'create_quote', { dealId: deal.id, lines: TWO_RATES }))
    await tool(solo, 'send_quote', { quoteId: id })
    const { tokenHash } = await inSolo(() => prisma.quote.findUniqueOrThrow({ where: { id } }))
    expect(tokenHash).toBeTruthy()
    expect((await tool(solo, 'read_quote', { quoteId: id })).content[0].text).not.toContain(tokenHash)
    expect((await tool(solo, 'list_quotes', { dealId: deal.id })).content[0].text).not.toContain(tokenHash)
  })

  it('list by status, expired worked out from the date', async () => {
    const { deal } = await dealInSolo()
    const { id } = parsed(await tool(solo, 'create_quote', { dealId: deal.id, lines: TWO_RATES }))
    await inSolo(() => prisma.quote.update({ where: { id }, data: { status: 'SENT', validUntil: new Date('2020-01-01') } }))
    const expired = parsed(await tool(solo, 'list_quotes', { status: 'expired', dealId: deal.id }))
    expect(expired.map((quote: { id: string; status: string }) => [quote.id, quote.status])).toEqual([[id, 'expired']])
    expect(parsed(await tool(solo, 'list_quotes', { status: 'sent', dealId: deal.id }))).toEqual([])
  })
})

describe('send_quote', () => {
  it('mails the customer and says to whom, without handing over the link', async () => {
    await inSolo(connectMailStandIn)
    const mails: { to: string[]; text: string }[] = []
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      mails.push(JSON.parse(String(init.body)))
      return new Response('{"id":"1"}')
    })
    const { deal, contact } = await dealInSolo()
    const { id } = parsed(await tool(solo, 'create_quote', { dealId: deal.id, lines: TWO_RATES }))
    const result = await tool(solo, 'send_quote', { quoteId: id })
    expect(parsed(result)).toMatchObject({ id, status: 'sent', mailedTo: contact.emails[0], url: `${ORIGIN}/quotes/${id}` })
    expect(mails).toHaveLength(1)
    const link = mails[0].text.match(/https?:\/\/\S+/)![0]
    expect(result.content[0].text).not.toContain(new URL(link).pathname)
    expect(result.content[0].text).not.toContain('/q/')
  })

  it("keeps the link off the conversation when no mail can leave, and says where to get one", async () => {
    const { deal } = await dealInSolo()
    const { id } = parsed(await tool(solo, 'create_quote', { dealId: deal.id, lines: TWO_RATES }))
    const result = await tool(solo, 'send_quote', { quoteId: id })
    expect(parsed(result)).toMatchObject({ status: 'sent', mailedTo: null })
    expect(parsed(result).note).toContain('New link')
    expect(result.content[0].text).not.toContain('/q/')
  })

  it('says what is missing, in the workspace it was asked for, and leaves the quote a draft', async () => {
    const { deal } = await runInWorkspace(beta, () => createDealFixture(`${tag}-beta`))
    const created = parsed(await tool(several, 'create_quote', { workspace: 'Beta', dealId: deal.id, lines: TWO_RATES }))
    const refused = await tool(several, 'send_quote', { workspace: 'Beta', quoteId: created.id })
    expect(refused.isError).toBe(true)
    expect(refused.content[0].text).toContain('The seller details lack: legal name, address, company number, contact email.')
    expect(parsed(await tool(several, 'read_quote', { workspace: 'Beta', quoteId: created.id })).status).toBe('draft')
  })

  it("can't send or read a quote from another of the member's workspaces by its id", async () => {
    const { deal } = await runInWorkspace(alpha, () => createDealFixture(`${tag}-alpha`))
    const { id } = parsed(await tool(several, 'create_quote', { workspace: 'Alpha', dealId: deal.id, lines: TWO_RATES }))
    for (const name of ['send_quote', 'read_quote']) {
      const refused = await tool(several, name, { workspace: 'Beta', quoteId: id })
      expect(refused.isError).toBe(true)
      expect(refused.content[0].text).toContain("doesn't exist")
    }
    expect(parsed(await tool(several, 'read_quote', { workspace: 'Alpha', quoteId: id })).status).toBe('draft')
  })

  it('links through the workspace for a member with several', async () => {
    const { deal } = await runInWorkspace(alpha, () => createDealFixture(`${tag}-alpha-2`))
    const { url, id } = parsed(await tool(several, 'create_quote', { workspace: 'Alpha', dealId: deal.id }))
    expect(url).toBe(`${ORIGIN}/workspace/${alpha}?next=%2Fquotes%2F${id}`)
  })
})
