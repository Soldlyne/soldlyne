import { beforeAll, describe, expect } from 'vitest'
import { createStages, workspaceForFile } from '@/test/fixtures'

const { prisma } = await import('@/lib/prisma')
const { withMcpActor } = await import('@/lib/actor')
const { createPartner, setDealPartner, setCommissionPaid } = await import('../actions')
const { partnersWithStats } = await import('../queries')

const tag = `partner-${Date.now()}`
let productId = ''
const dealIds: string[] = []

const workspace = workspaceForFile(tag)

beforeAll(() =>
  workspace.run(async () => {
    productId = (await prisma.product.create({ data: { name: `P ${tag}` } })).id
    const { open, won } = await createStages(tag)
    dealIds.push((await prisma.deal.create({ data: { name: `Won ${tag}`, productId, stageId: won.id, amount: BigInt(1_000_000) } })).id)
    dealIds.push((await prisma.deal.create({ data: { name: `Open ${tag}`, productId, stageId: open.id, amount: BigInt(500_000) } })).id)
  }),
)

describe('partners', () => {
  workspace.it('counts referred deals and commission on won deals only, until paid', () =>
    withMcpActor('test', async () => {
      const { id } = await createPartner({ name: tag, type: 'CONSULTANT', commissionPct: 10 })
      for (const dealId of dealIds) await setDealPartner(dealId, id)
      let stats = (await partnersWithStats()).find((p) => p.id === id)!
      expect(stats.referred).toBe(2)
      expect(stats.won).toBe(1)
      expect(stats.owed).toBe(100_000) // 10% of 10,000 EUR, in cents
      expect((await prisma.deal.findUniqueOrThrow({ where: { id: dealIds[0] } })).source).toBe('REFERRAL')
      await setCommissionPaid(dealIds[0], true)
      stats = (await partnersWithStats()).find((p) => p.id === id)!
      expect(stats.owed).toBe(0)
      expect(stats.paid).toBe(100_000)
    }))
})
