'use server'

import { requireSeat } from '@/lib/workspaces/seat'
import { markQuoteDeclined } from './answer'
import { copyQuote, createQuote, updateQuote, type QuoteInput } from './quotes'
import { attempt, type Answer } from './refusal'
import { saveSellerDetails } from './seller'
import { renewQuoteLink, sendQuote, type SentQuote } from './send'

// For someone at the screen. Each function below checks who is asking itself: a server action is an address anyone can post to.

export const newQuoteForDeal = async (dealId: string): Promise<Answer<{ id: string }>> => attempt(() => createQuote({ dealId }))

export const saveDraft = async (id: string, input: QuoteInput): Promise<Answer> => attempt(() => updateQuote(id, input))

export const sendFromScreen = async (id: string): Promise<Answer<SentQuote>> => attempt(() => sendQuote(id))

export const newLinkFromScreen = async (id: string): Promise<Answer<SentQuote>> => attempt(() => renewQuoteLink(id))

export const copyFromScreen = async (id: string): Promise<Answer<{ id: string }>> => attempt(() => copyQuote(id))

export const declineFromScreen = async (id: string, reason: string): Promise<Answer> => attempt(() => markQuoteDeclined(id, reason))

/** The seller details from Settings' form. Whether this member may is decided inside, against the team as it stands. */
export async function saveSellerFromForm(_previous: Answer | null, form: FormData): Promise<Answer> {
  const { user, workspace } = await requireSeat()
  const text = (name: string) => String(form.get(name) ?? '')
  return saveSellerDetails(workspace.id, user.id, {
    legalName: text('legalName'),
    address: text('address'),
    companyNumber: text('companyNumber'),
    vatNumber: text('vatNumber'),
    contactEmail: text('contactEmail'),
    defaultCurrency: text('defaultCurrency'),
    defaultTaxRate: text('defaultTaxRate'),
    defaultValidityDays: text('defaultValidityDays'),
    defaultTerms: text('defaultTerms'),
    yearlyQuoteNumbers: form.get('yearlyQuoteNumbers') === 'on',
  })
}
