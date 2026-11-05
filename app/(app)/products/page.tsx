import type { Metadata } from 'next'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { formatMoney } from '@/lib/crm/format'
import { CatalogEditor } from './catalog-editor'

export const metadata: Metadata = { title: 'Products' }

export default async function ProductsPage() {
  const [entities, projects, products, deals] = await Promise.all([
    prisma.entity.findMany({ orderBy: { position: 'asc' } }),
    prisma.project.findMany({ orderBy: [{ archived: 'asc' }, { position: 'asc' }] }),
    prisma.product.findMany({ orderBy: [{ archived: 'asc' }, { position: 'asc' }] }),
    prisma.deal.findMany({ where: { deletedAt: null }, select: { productId: true, amount: true, stage: { select: { kind: true } } } }),
  ])
  const stats = Object.fromEntries(
    products.map((product) => {
      const own = deals.filter((d) => d.productId === product.id)
      const open = own.filter((d) => d.stage.kind === 'OPEN')
      const won = own.filter((d) => d.stage.kind === 'WON')
      return [product.id, `${open.length} open · ${formatMoney(open.reduce((s, d) => s + Number(d.amount ?? 0), 0))} · ${won.length} won`]
    }),
  )

  return (
    <div className="mx-auto w-full max-w-5xl space-y-10 p-4 lg:p-8">
      <div>
        <h1 className="text-xl font-semibold">Products</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Company, then project (the commercial brand), then the products it sells. Drag the handles to reorder or to move a project to another company and a
          product to another project. Add projects and products in{' '}
          <Link href="/settings" className="text-link hover:underline">
            Settings
          </Link>
          .
        </p>
      </div>
      <CatalogEditor entities={entities} projects={projects} products={products} stats={stats} />
    </div>
  )
}
