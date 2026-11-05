'use server'

import { setDealPartner } from './actions'

/** Adapter for EditableField, which saves { partnerId: value }. */
export async function setDealPartnerFromField(dealId: string, patch: { partnerId?: string | null }) {
  await setDealPartner(dealId, patch.partnerId ?? null)
}
