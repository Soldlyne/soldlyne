'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { acceptQuoteAtLink, declineQuoteAtLink, type Answered, type Client } from './answer'
import { quoteLinkPath } from './token'

// For a customer at their link, with no account: the token is the only thing these trust.

/** The address and browser the request reports. As good as the host in front: Vercel sets these itself, and a bare server takes them as sent. */
function clientOf(requestHeaders: Headers): Client {
  const forwarded = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim()
  return { ip: forwarded || requestHeaders.get('x-real-ip'), userAgent: requestHeaders.get('user-agent') }
}

/** A quote that took the answer shows it on its page; one that refused keeps the form on screen, with the reason. */
function refreshed(token: string, answered: Answered): Answered {
  if (answered.ok) revalidatePath(quoteLinkPath(token))
  return answered
}

export async function acceptFromPage(token: string, _previous: Answered | null, form: FormData): Promise<Answered> {
  const answer = { name: String(form.get('name') ?? ''), confirmed: form.get('confirmed') === 'on' }
  return refreshed(token, await acceptQuoteAtLink(token, answer, clientOf(await headers())))
}

export async function declineFromPage(token: string, _previous: Answered | null, form: FormData): Promise<Answered> {
  return refreshed(token, await declineQuoteAtLink(token, String(form.get('reason') ?? '')))
}
