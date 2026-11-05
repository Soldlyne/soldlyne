import type { Metadata } from 'next'
import { listProducts } from '@/lib/crm/queries'
import { ImportWizard } from './import-wizard'

export const metadata: Metadata = { title: 'Import' }

export default async function ImportPage() {
  const products = await listProducts()
  return (
    <div className="mx-auto w-full max-w-4xl p-4 lg:p-8">
      <h1 className="text-xl font-semibold">Import a CSV</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Companies, people and deals in one pass. Rows matching an existing domain, email or LinkedIn profile update it instead of creating a duplicate.
      </p>
      <ImportWizard products={products} />
    </div>
  )
}
