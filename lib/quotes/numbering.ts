import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'

/**
 * The workspace's next quote number, in its transaction. The upsert locks the counter's row until that
 * transaction ends: a concurrent quote waits for the outcome, and a rollback gives the number back, so
 * none is skipped or used twice. Raw because only a single statement holds under concurrency.
 */
export async function nextQuoteNumber(tx: Pick<Prisma.TransactionClient, '$queryRaw'>): Promise<number> {
  const [counter] = await tx.$queryRaw<{ last: number }[]>`INSERT INTO "QuoteCounter" ("id", "last") VALUES (${randomUUID()}, 1) ON CONFLICT ("workspaceId") DO UPDATE SET "last" = "QuoteCounter"."last" + 1 RETURNING "last"`
  return counter.last
}

/** 0042, or 2026-0042. The year is only a prefix: the count runs on across years, so no number comes back. */
export const quoteReference = (number: number, year: number | null) => `${year === null ? '' : `${year}-`}${String(number).padStart(4, '0')}`
