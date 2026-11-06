import { createMcpHandler } from '@modelcontextprotocol/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createStages, createUser, removeUsers, removeWorkspace } from '@/test/fixtures'
import { mcpClient } from '@/test/mcp-client'

const { prisma, runInWorkspace } = await import('@/lib/prisma')
const { trustedPrisma } = await import('@/lib/trusted-prisma')
const { createWorkspace, workspacesOf } = await import('@/lib/workspaces/workspaces')
const { soldlyneServer } = await import('../server')

const tag = `tools-${Date.now()}`
const domain = `@${tag}.example`
const ORIGIN = 'http://localhost:3100'

let solo = ''
let soloId = ''
let several = ''
let alpha = ''
let beta = ''
let foreign = ''
let foreignOwner = ''

const { clientFor, parsed, tool } = mcpClient(ORIGIN)

beforeAll(async () => {
  solo = (await createUser(`solo${domain}`)).id
  soloId = await createWorkspace(solo, 'Solo')
  several = (await createUser(`several${domain}`)).id
  alpha = await createWorkspace(several, 'Alpha')
  beta = await createWorkspace(several, 'Beta')
  foreignOwner = (await createUser(`foreign${domain}`)).id
  foreign = await createWorkspace(foreignOwner, 'Foreign')
  await runInWorkspace(alpha, () => prisma.company.create({ data: { name: 'Only in Alpha', domain: `alpha-${tag}.example` } }))
  await runInWorkspace(beta, () => prisma.company.create({ data: { name: 'Only in Beta', domain: `beta-${tag}.example` } }))
  await runInWorkspace(foreign, () => prisma.company.create({ data: { name: 'Only in Foreign', domain: `foreign-${tag}.example` } }))
})

afterAll(async () => {
  for (const id of [soloId, alpha, beta, foreign]) await removeWorkspace(id)
  await removeUsers(domain)
})

beforeEach(() => {
  process.env.BETTER_AUTH_URL = ORIGIN
})

const TOOLS = ['daily_brief', 'search_records', 'get_record', 'list_deals', 'list_catalog', 'list_stages', 'list_partners', 'create_company', 'create_person', 'create_deal', 'update_deal', 'log_activity', 'create_task', 'complete_task', 'add_note', 'create_partner', 'set_deal_partner', 'list_quotes', 'read_quote', 'create_quote', 'update_quote', 'send_quote', 'list_connectors', 'connect_service', 'check_connection']

describe('a member with one workspace', () => {
  it('sees the 25 tools and list_workspaces, with no workspace argument', async () => {
    const { tools } = await clientFor(solo)('tools/list')
    expect(tools.map(({ name }: { name: string }) => name).sort()).toEqual([...TOOLS, 'list_workspaces'].sort())
    for (const { inputSchema } of tools) expect(inputSchema.properties ?? {}).not.toHaveProperty('workspace')
  })

  it('is served in it, with plain links', async () => {
    const created = parsed(await tool(solo, 'create_company', { name: 'Solo Co' }))
    expect(created.url).toBe(`${ORIGIN}/companies/${created.id}`)
    const { companies } = parsed(await tool(solo, 'search_records', { query: 'Solo Co' }))
    expect(companies.map(({ id }: { id: string }) => id)).toEqual([created.id])
  })

  it("is refused when still naming a workspace they aren't in, instead of being quietly served", async () => {
    const refused = await tool(solo, 'list_stages', { workspace: 'Alpha' })
    expect(refused.isError).toBe(true)
    expect(refused.content[0].text).toContain('"Solo"')
    expect(refused.content[0].text).not.toContain('Alpha"')
  })

  it('has no extra word about workspaces in its instructions', async () => {
    const { instructions } = await clientFor(solo)('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } })
    expect(instructions).not.toContain('several companies')
  })
})

describe('a member with several workspaces', () => {
  it('sees a workspace argument on every tool but list_workspaces, and is told why', async () => {
    const { tools } = await clientFor(several)('tools/list')
    for (const { name, inputSchema } of tools) {
      if (name === 'list_workspaces') expect(inputSchema.properties ?? {}).not.toHaveProperty('workspace')
      else expect(inputSchema.properties, name).toHaveProperty('workspace')
    }
    const { instructions } = await clientFor(several)('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } })
    expect(instructions).toContain('several companies')
  })

  it('lists them with list_workspaces', async () => {
    expect(parsed(await tool(several, 'list_workspaces'))).toEqual({
      workspaces: [
        { id: alpha, name: 'Alpha', role: 'owner' },
        { id: beta, name: 'Beta', role: 'owner' },
      ],
    })
  })

  it('is refused with the names of theirs when naming none', async () => {
    const refused = await tool(several, 'list_stages')
    expect(refused.isError).toBe(true)
    expect(refused.content[0].text).toContain('"Alpha"')
    expect(refused.content[0].text).toContain('"Beta"')
  })

  it("gets the same words for an unknown name and someone else's: nothing says it exists", async () => {
    const asked = (await tool(several, 'list_stages')).content[0].text
    expect((await tool(several, 'list_stages', { workspace: 'Nobody' })).content[0].text).toBe(asked)
    expect((await tool(several, 'list_stages', { workspace: 'Foreign' })).content[0].text).toBe(asked)
    expect((await tool(several, 'list_stages', { workspace: foreign })).content[0].text).toBe(asked)
  })

  it('reads the right data in each, by name or id', async () => {
    const inAlpha = parsed(await tool(several, 'search_records', { query: 'Only in', workspace: 'Alpha' }))
    expect(inAlpha.companies.map(({ name }: { name: string }) => name)).toEqual(['Only in Alpha'])
    const inBeta = parsed(await tool(several, 'search_records', { query: 'Only in', workspace: beta }))
    expect(inBeta.companies.map(({ name }: { name: string }) => name)).toEqual(['Only in Beta'])
  })

  it('writes where it was told, recorded as done by MCP, with a link through that workspace', async () => {
    const created = parsed(await tool(several, 'create_company', { name: 'Written by a tool', workspace: 'Beta' }))
    expect(created.url).toBe(`${ORIGIN}/workspace/${beta}?next=%2Fcompanies%2F${created.id}`)
    const row = await runInWorkspace(beta, () => prisma.company.findUniqueOrThrow({ where: { id: created.id } }))
    expect(row.createdBy).toBe('MCP')
    expect(await runInWorkspace(alpha, () => prisma.company.count({ where: { id: created.id } }))).toBe(0)
  })

  it("can't reach a record of one workspace from another by its id", async () => {
    const { id } = await runInWorkspace(alpha, () => prisma.company.findFirstOrThrow({ where: { name: 'Only in Alpha' } }))
    const read = await tool(several, 'get_record', { type: 'company', id, workspace: 'Beta' })
    expect(read.isError).toBe(true)
    expect(read.content[0].text).not.toContain('Only in Alpha')
  })

  it('checks membership on each call, not when the server was built', async () => {
    const leaver = (await createUser(`leaver${domain}`)).id
    const kept = await createWorkspace(leaver, 'Kept')
    await trustedPrisma.member.create({ data: { workspaceId: alpha, userId: leaver, role: 'MEMBER' } })
    const workspaces = await workspacesOf(leaver)
    const handler = createMcpHandler(() => soldlyneServer({ userId: leaver, clientId: 'test-client', workspaces }))
    await trustedPrisma.member.delete({ where: { workspaceId_userId: { workspaceId: alpha, userId: leaver } } })
    const response = await handler.fetch(
      new Request(`${ORIGIN}/api/mcp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_stages', arguments: { workspace: 'Alpha' } } }),
      }),
    )
    const text = await response.text()
    expect(text).toContain('isError')
    expect(text).toContain('Which workspace?')
    await removeWorkspace(kept)
  })
})

describe('tools in a workspace', () => {
  it('reach a product with no project, as a new workspace has, so a deal can be opened for it', async () => {
    const { productsWithoutProject } = parsed(await tool(solo, 'list_catalog'))
    expect(productsWithoutProject.map(({ name }: { name: string }) => name)).toContain('Main product')
  })

  it('open a deal at its first stage, and leave the rest of the catalog out when archived', async () => {
    const { archivedId, productId } = await runInWorkspace(soloId, async () => {
      await createStages(tag)
      const archived = await prisma.product.create({ data: { name: `Archived ${tag}`, archived: true } })
      const product = await prisma.product.findFirstOrThrow({ where: { name: 'Main product' } })
      return { archivedId: archived.id, productId: product.id }
    })
    const { productsWithoutProject } = parsed(await tool(solo, 'list_catalog'))
    expect(productsWithoutProject.map(({ id }: { id: string }) => id)).not.toContain(archivedId)
    const created = parsed(await tool(solo, 'create_deal', { name: 'From a tool', productId }))
    const deal = await runInWorkspace(soloId, () => prisma.deal.findUniqueOrThrow({ where: { id: created.id }, include: { stage: true } }))
    expect(deal.stage.name).toBe('Identified')
    expect(deal.createdBy).toBe('MCP')
  })

  it('offer no way to invite, remove or change members', async () => {
    const { tools } = await clientFor(several)('tools/list')
    for (const { name } of tools) expect(name).not.toMatch(/invite|member|remove|role/)
  })
})
