import 'server-only'
import type { Actor, Prisma } from '@prisma/client'

type Linked = { dealId: string | null; companyId: string | null; contactId: string | null }

/** A line on the timelines of the quote's deal, company and contact. Given a transaction, it stands or falls with what it says happened. */
export const recordQuoteEvent = (client: Pick<Prisma.TransactionClient, 'timelineEvent'>, name: string, { dealId, companyId, contactId }: Linked, properties: Prisma.InputJsonObject, actor: Actor) =>
  client.timelineEvent.create({ data: { name, properties, actor, dealId, companyId, personId: contactId } })
