import { beforeAll, describe, expect } from 'vitest'
import { createStages, workspaceForFile } from '@/test/fixtures'

const { prisma } = await import('@/lib/prisma')
const { captureLead, hashKey } = await import('../capture')

const tag = `lead-${Date.now()}`
let sourceId = ''
let productId = ''

const workspace = workspaceForFile(tag)

beforeAll(() =>
  workspace.run(async () => {
    await createStages(tag)
    productId = (await prisma.product.create({ data: { name: `Cloud ${tag}` } })).id
    sourceId = (await prisma.leadSource.create({ data: { name: `Waitlist ${tag}`, keyHash: hashKey(tag), keyPrefix: 'lead_x', productId } })).id
  }),
)

describe('captureLead', () => {
  workspace.it('creates person, company from the work domain, deal and task, and records the opt-in', async () => {
    const result = await captureLead(sourceId, { email: `Camille@${tag}.example`, name: 'Camille Martin', company: 'Acme', message: 'Hello', consent: true, page: '/waitlist' })
    expect(result.created).toBe(true)
    const person = await prisma.person.findUniqueOrThrow({ where: { id: result.personId }, include: { company: true } })
    expect(person.firstName).toBe('Camille')
    expect(person.company?.domain).toBe(`${tag}.example`)
    expect(person.consentAt).not.toBeNull()
    expect(person.consentSource).toBe(`Waitlist ${tag} (/waitlist)`)
    expect(await prisma.deal.count({ where: { productId, contactId: person.id } })).toBe(1)
    expect(await prisma.task.count({ where: { personId: person.id } })).toBe(1)
  })

  workspace.it('updates instead of duplicating, and keeps one open deal', async () => {
    const result = await captureLead(sourceId, { email: `camille@${tag}.example`, phone: '+33 6 00 00 00 00', consent: false })
    expect(result.created).toBe(false)
    expect(await prisma.person.count({ where: { emails: { has: `camille@${tag}.example` } } })).toBe(1)
    expect(await prisma.deal.count({ where: { productId } })).toBe(1)
    const person = await prisma.person.findUniqueOrThrow({ where: { id: result.personId } })
    expect(person.phones).toContain('+33 6 00 00 00 00')
    expect(person.consentAt).not.toBeNull()
  })

  workspace.it('does not create a company from a free-mail domain, and records no opt-in without consent', async () => {
    const result = await captureLead(sourceId, { email: `jo.${tag}@gmail.com`, firstName: 'Jo' })
    const person = await prisma.person.findUniqueOrThrow({ where: { id: result.personId } })
    expect(person.companyId).toBeNull()
    expect(person.consentAt).toBeNull()
    expect(await prisma.company.count({ where: { domain: 'gmail.com' } })).toBe(0)
  })
})
