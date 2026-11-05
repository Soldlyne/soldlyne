import { describe, expect, it } from 'vitest'
import { workspaceForFile } from '@/test/fixtures'
import { companyWhere, dealWhere, filterQuery, personWhere } from '../list-filters'

const { prisma } = await import('@/lib/prisma')

const name = `Priority A ${Date.now()}`
const workspace = workspaceForFile('list-filters')

describe('list filters', () => {
  it('builds queries Prisma accepts for every facet', () =>
    workspace.run(async () => {
      await prisma.company.count({ where: companyWhere({ q: 'a', priority: 'none', people: 'none', deal: 'open', project: 'x', contact: '30d+' }) })
      await prisma.person.count({ where: personWhere({ q: 'a', email: 'yes', optin: 'yes', priority: 'A', project: 'x', contact: 'never' }) })
      await prisma.person.count({ where: personWhere({ contact: '7d' }) })
      await prisma.deal.count({ where: dealWhere({ q: 'a', project: 'x', stage: 'open', next: 'due', stale: 'yes', contact: '7d', nocontact: 'yes' }) })
    }))
  it('finds a company by its priority', () =>
    workspace.run(async () => {
      const { id } = await prisma.company.create({ data: { name, priority: 'A' } })
      const found = await prisma.company.findMany({ where: companyWhere({ priority: 'A' }), select: { id: true } })
      expect(found.map((company) => company.id)).toContain(id)
      expect(await prisma.company.count({ where: { id, ...companyWhere({ priority: 'none' }) } })).toBe(0)
    }))
  it('normalizes the saved query', () => {
    expect(filterQuery({ stage: 'open', view: 'v1', q: '', project: 'p' })).toBe('project=p&stage=open')
  })
})
