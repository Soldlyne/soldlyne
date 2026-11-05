import 'server-only'
import { trustedPrisma } from '@/lib/trusted-prisma'

export const normalizedEmail = (email: string) => email.trim().toLowerCase()

/** Whether this address has an invitation still good: what lets someone get an account. Trusted: the sign-up gate comes before any workspace is known. */
export async function hasLiveInvitation(email: string): Promise<boolean> {
  const live = await trustedPrisma.invitation.findFirst({ where: { email: normalizedEmail(email), acceptedAt: null, expiresAt: { gt: new Date() } }, select: { id: true } })
  return Boolean(live)
}
