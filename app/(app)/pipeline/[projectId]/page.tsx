import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { listDeals, listProducts, listStages } from '@/lib/crm/queries'
import { now } from '@/lib/crm/format'
import { PipelineBoard } from '@/components/crm/pipeline-board'
import { NewDealButton } from '@/components/crm/create-dialogs'
import { cn } from '@/lib/utils'

export async function generateMetadata({ params }: PageProps<'/pipeline/[projectId]'>): Promise<Metadata> {
  const project = await prisma.project.findUnique({ where: { id: (await params).projectId } })
  return { title: project?.name ?? 'Pipeline' }
}

export default async function ProjectPipelinePage({ params, searchParams }: PageProps<'/pipeline/[projectId]'>) {
  const { projectId } = await params
  const productId = (await searchParams).product?.toString()
  const project = await prisma.project.findUnique({ where: { id: projectId }, include: { products: { where: { archived: false }, orderBy: { position: 'asc' } } } })
  if (!project) notFound()
  const [deals, stages, products] = await Promise.all([
    listDeals(productId ? { productId } : { projectId }),
    listStages(),
    listProducts(),
  ])
  const chip = (active: boolean) =>
    cn('rounded-md border px-2 py-1 text-xs transition-colors', active ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground')
  return (
    <PipelineBoard
      now={now().getTime()}
      title={project.name}
      color={project.color}
      deals={deals}
      stages={stages}
      showProduct={!productId && project.products.length > 1}
      filters={
        project.products.length > 1 ? (
          <div className="flex flex-wrap gap-1">
            <Link href={`/pipeline/${projectId}`} className={chip(!productId)}>
              All
            </Link>
            {project.products.map((product) => (
              <Link key={product.id} href={`/pipeline/${projectId}?product=${product.id}`} className={chip(productId === product.id)}>
                {product.name}
              </Link>
            ))}
          </div>
        ) : null
      }
      actions={<NewDealButton products={products.filter((p) => p.projectId === projectId)} productId={productId} />}
    />
  )
}
