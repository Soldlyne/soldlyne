import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { currentSeat } from '@/lib/workspaces/seat'
import { personName } from '@/lib/crm/format'

export async function GET(request: Request) {
  if (!(await currentSeat())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const q = new URL(request.url).searchParams.get('q')?.trim() ?? ''
  if (q.length < 1) return NextResponse.json({ results: [] })
  const like = { contains: q, mode: 'insensitive' as const }
  const [companies, people, deals] = await Promise.all([
    prisma.company.findMany({ where: { deletedAt: null, OR: [{ name: like }, { domain: like }] }, take: 6, select: { id: true, name: true, domain: true } }),
    prisma.person.findMany({
      where: { deletedAt: null, OR: [{ firstName: like }, { lastName: like }, { emails: { has: q.toLowerCase() } }] },
      take: 6,
      select: { id: true, firstName: true, lastName: true, emails: true, company: { select: { name: true } } },
    }),
    prisma.deal.findMany({ where: { deletedAt: null, name: like }, take: 6, select: { id: true, name: true, product: { select: { name: true } } } }),
  ])
  return NextResponse.json({
    results: [
      ...companies.map((c) => ({ type: 'company', id: c.id, title: c.name, subtitle: c.domain ?? '', href: `/companies/${c.id}` })),
      ...people.map((p) => ({ type: 'person', id: p.id, title: personName(p), subtitle: p.company?.name ?? p.emails[0] ?? '', href: `/people/${p.id}` })),
      ...deals.map((d) => ({ type: 'deal', id: d.id, title: d.name, subtitle: d.product.name, href: `/deals/${d.id}` })),
    ],
  })
}
