'use client'

import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRun } from '@/hooks/ui/use-run'
import { newQuoteForDeal } from '@/lib/quotes/actions'

/** A draft takes its number when it's created, so the button makes one and goes to it. */
export function NewQuoteButton({ dealId }: { dealId: string }) {
  const router = useRouter()
  const { pending, run } = useRun()
  const create = async () => {
    const created = await newQuoteForDeal(dealId)
    if (!created.ok) throw new Error(created.error)
    router.push(`/quotes/${created.id}`)
  }
  return (
    <Button size="xs" variant="outline" loading={pending} onClick={() => run(create)}>
      <Plus /> New quote
    </Button>
  )
}
