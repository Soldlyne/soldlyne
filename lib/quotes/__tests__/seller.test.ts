import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createUser, removeUsers, removeWorkspace } from '@/test/fixtures'

const { prisma, runInWorkspace } = await import('@/lib/prisma')
const { trustedPrisma } = await import('@/lib/trusted-prisma')
const { createWorkspace } = await import('@/lib/workspaces/workspaces')
const { saveSellerDetails } = await import('../seller')

const tag = `seller-${Date.now()}`
const domain = `@${tag}.example`
const FILLED = { legalName: 'Northwind Works', address: '1 Example Street', companyNumber: '123', vatNumber: '', contactEmail: 'sales@northwind.example', defaultCurrency: 'eur', defaultTaxRate: '5,5', defaultValidityDays: '45', defaultTerms: 'Our terms.', yearlyQuoteNumbers: true }

let owner = ''
let admin = ''
let member = ''
let stranger = ''
let workspace = ''
let otherWorkspace = ''

const stored = () => runInWorkspace(workspace, () => prisma.sellerDetails.findFirst())

beforeAll(async () => {
  owner = (await createUser(`owner${domain}`)).id
  admin = (await createUser(`admin${domain}`)).id
  member = (await createUser(`member${domain}`)).id
  stranger = (await createUser(`stranger${domain}`)).id
  workspace = await createWorkspace(owner, 'Seller')
  otherWorkspace = await createWorkspace(stranger, 'Other')
  await trustedPrisma.member.createMany({ data: [{ workspaceId: workspace, userId: admin, role: 'ADMIN' }, { workspaceId: workspace, userId: member, role: 'MEMBER' }] })
})

afterAll(async () => {
  for (const id of [workspace, otherWorkspace]) await removeWorkspace(id)
  await removeUsers(domain)
})

describe('seller details', () => {
  it('are refused to a member, and to someone from outside the workspace', async () => {
    for (const actor of [member, stranger]) expect(await saveSellerDetails(workspace, actor, FILLED)).toEqual({ ok: false, error: 'Only owners and admins can change the seller details.' })
    expect(await stored()).toBeNull()
  })

  it('are saved for an owner, read as exact values, with an empty field left empty', async () => {
    expect(await saveSellerDetails(workspace, owner, FILLED)).toEqual({ ok: true })
    expect(await stored()).toMatchObject({ legalName: 'Northwind Works', vatNumber: null, contactEmail: 'sales@northwind.example', defaultCurrency: 'EUR', defaultTaxRateMilliPercent: 5500, defaultValidityDays: 45, defaultTerms: 'Our terms.', yearlyQuoteNumbers: true })
  })

  it('are saved for an admin, on the same row', async () => {
    expect(await saveSellerDetails(workspace, admin, { ...FILLED, legalName: 'Changed by admin' })).toEqual({ ok: true })
    expect((await stored())?.legalName).toBe('Changed by admin')
    expect(await runInWorkspace(workspace, () => prisma.sellerDetails.count())).toBe(1)
  })

  it.each([
    [{ contactEmail: 'not an address' }, 'contact email'],
    [{ defaultCurrency: 'XXQ' }, 'default currency'],
    [{ defaultValidityDays: '0' }, 'at least one day'],
    [{ defaultValidityDays: 'soon' }, ''],
    [{ defaultTaxRate: '120' }, 'from 0 to 100'],
  ])('say what is wrong with %o', async (bad, word) => {
    const saved = await saveSellerDetails(workspace, owner, { ...FILLED, ...bad })
    expect(saved.ok).toBe(false)
    if (!saved.ok) expect(saved.error).toContain(word)
  })
})
