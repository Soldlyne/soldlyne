import 'server-only'
import { sha256 } from '@/lib/hash'
import { trustedPrisma } from '@/lib/trusted-prisma'
import { isSignedQuoteToken } from './token'

/** Which quote and workspace a customer's link is for, or null. Trusted: the link is what says which workspace it is, and everything after this is bound to it. */
export async function findQuoteAtLink(token: string): Promise<{ id: string; workspaceId: string } | null> {
  if (!isSignedQuoteToken(token)) return null
  return trustedPrisma.quote.findUnique({ where: { tokenHash: sha256(token) }, select: { id: true, workspaceId: true } })
}
