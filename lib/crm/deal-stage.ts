import type { Prisma } from '@prisma/client'

/** A position above every deal in this stage's column: a deal that just arrived goes on top. */
export async function topPosition(client: Pick<Prisma.TransactionClient, 'deal'>, stageId: string, productId: string) {
  const first = await client.deal.findFirst({ where: { stageId, productId, deletedAt: null }, orderBy: { position: 'asc' } })
  return (first?.position ?? 1) - 1
}
