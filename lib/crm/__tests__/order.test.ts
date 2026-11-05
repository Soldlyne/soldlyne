import { beforeAll, describe, expect } from 'vitest'
import { workspaceForFile } from '@/test/fixtures'

const { prisma } = await import('@/lib/prisma')
const { withMcpActor } = await import('@/lib/actor')
const { reorderStages, saveCatalogOrder } = await import('../actions')

const workspace = workspaceForFile('order')
const other = workspaceForFile('order-other')
const asActor = <T>(work: () => Promise<T>) => withMcpActor('test', work)

const stageOrder = async () => (await prisma.stage.findMany({ orderBy: { position: 'asc' } })).map(({ name }) => name)
let ids: Record<string, string> = {}
let foreignStage = ''
let foreignProduct = ''

beforeAll(async () => {
  ids = await workspace.run(async () => {
    const [first, second] = [await prisma.stage.create({ data: { name: 'First', position: 0 } }), await prisma.stage.create({ data: { name: 'Second', position: 1 } })]
    const entity = await prisma.entity.create({ data: { name: 'Entity' } })
    const project = await prisma.project.create({ data: { name: 'Project' } })
    const product = await prisma.product.create({ data: { name: 'Product' } })
    return { first: first.id, second: second.id, entity: entity.id, project: project.id, product: product.id }
  })
  await other.run(async () => {
    foreignStage = (await prisma.stage.create({ data: { name: 'Foreign' } })).id
    foreignProduct = (await prisma.product.create({ data: { name: 'Foreign' } })).id
  })
})

describe('reordering in one transaction', () => {
  workspace.it('saves the new order of stages', () =>
    asActor(async () => {
      await reorderStages([ids.second, ids.first])
      expect(await stageOrder()).toEqual(['Second', 'First'])
    }),
  )

  workspace.it("touches nothing when one id isn't this workspace's", () =>
    asActor(async () => {
      await expect(reorderStages([ids.first, foreignStage])).rejects.toThrow()
      expect(await stageOrder()).toEqual(['Second', 'First'])
    }),
  )

  workspace.it('moves companies, projects and products together', () =>
    asActor(async () => {
      await saveCatalogOrder({ entities: [ids.entity], projects: [{ id: ids.project, entityId: ids.entity }], products: [{ id: ids.product, projectId: ids.project }] })
      expect((await prisma.project.findUniqueOrThrow({ where: { id: ids.project } })).entityId).toBe(ids.entity)
      expect((await prisma.product.findUniqueOrThrow({ where: { id: ids.product } })).projectId).toBe(ids.project)
    }),
  )

  workspace.it('rolls all of it back when a product belongs elsewhere', () =>
    asActor(async () => {
      await expect(saveCatalogOrder({ entities: [], projects: [{ id: ids.project, entityId: null }], products: [{ id: foreignProduct, projectId: null }] })).rejects.toThrow()
      expect((await prisma.project.findUniqueOrThrow({ where: { id: ids.project } })).entityId).toBe(ids.entity)
    }),
  )
})
