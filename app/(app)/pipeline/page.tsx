import type { Metadata } from 'next'
import { listDeals, listProducts, listStages } from '@/lib/crm/queries'
import { now } from '@/lib/crm/format'
import { PipelineBoard } from '@/components/crm/pipeline-board'
import { NewDealButton } from '@/components/crm/create-dialogs'

export const metadata: Metadata = { title: 'Pipeline' }

export default async function PipelinePage() {
  const [deals, stages, products] = await Promise.all([listDeals(), listStages(), listProducts()])
  return (
    <PipelineBoard
      now={now().getTime()}
      title="All deals"
      deals={deals}
      stages={stages}
      showProduct
      actions={<NewDealButton products={products} />}
    />
  )
}
