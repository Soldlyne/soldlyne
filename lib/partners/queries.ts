import 'server-only'
import { prisma } from '@/lib/prisma'

/** Partners with their referred deals and commissions (won amount × rate). */
export async function partnersWithStats() {
  const partners = await prisma.partner.findMany({
    orderBy: [{ status: 'asc' }, { name: 'asc' }],
    include: {
      company: { select: { id: true, name: true } },
      contact: { select: { id: true, firstName: true, lastName: true, emails: true } },
      deals: {
        where: { deletedAt: null },
        select: { id: true, name: true, amount: true, commissionPaidAt: true, stage: { select: { name: true, kind: true } }, company: { select: { name: true } } },
        orderBy: { updatedAt: 'desc' },
      },
    },
  })
  return partners.map((partner) => {
    const won = partner.deals.filter((d) => d.stage.kind === 'WON')
    const commission = (d: { amount: bigint | null }) => Math.round((Number(d.amount ?? 0) * partner.commissionPct) / 100)
    return {
      ...partner,
      referred: partner.deals.length,
      open: partner.deals.filter((d) => d.stage.kind === 'OPEN').length,
      won: won.length,
      wonValue: won.reduce((s, d) => s + Number(d.amount ?? 0), 0),
      owed: won.filter((d) => !d.commissionPaidAt).reduce((s, d) => s + commission(d), 0),
      paid: won.filter((d) => d.commissionPaidAt).reduce((s, d) => s + commission(d), 0),
    }
  })
}
export type PartnerRow = Awaited<ReturnType<typeof partnersWithStats>>[number]
