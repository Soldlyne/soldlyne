import type { Prisma } from '@prisma/client'

const STAGES = [
  { name: 'Identified', kind: 'OPEN', probability: 5 },
  { name: 'Contacted', kind: 'OPEN', probability: 10 },
  { name: 'Conversation', kind: 'OPEN', probability: 25 },
  { name: 'Meeting', kind: 'OPEN', probability: 40 },
  { name: 'Proposal', kind: 'OPEN', probability: 60 },
  { name: 'Won', kind: 'WON', probability: 100 },
  { name: 'Lost', kind: 'LOST', probability: 0 },
] as const

/** Every deal is for a product: a new workspace starts with one, to rename or replace in Settings. */
const DEFAULT_PRODUCT = 'Main product'

/** What a new workspace starts with, in a transaction already bound to it. */
export async function createDefaults(tx: Prisma.TransactionClient) {
  await tx.stage.createMany({ data: STAGES.map((stage, index) => ({ ...stage, position: index })) })
  await tx.product.create({ data: { name: DEFAULT_PRODUCT } })
}
