import 'server-only'
import { ResendRefusal, sendThroughResend } from '@/lib/mail'
import { connectedFields, isConnected, markFailing } from './connections'

/** The connector that holds each workspace's own Resend account. */
export const RESEND_CONNECTOR = 'resend'

/** What a refusal at sending means: the key or the sender no longer holds. Anything else says nothing about them. */
const REFUSED_CREDENTIALS = [401, 403]

const MAIL_REFUSED = "Resend refused the last mail: check the key, and that the sender's domain is verified there."

/** Whether a mail to this workspace's customers can leave. */
export const canMailCustomers = () => isConnected(RESEND_CONNECTOR)

/**
 * A company's mail to its customers, from its own domain, through its own account: never the install's,
 * which only writes to members. Says whether it left, and never throws: a failing provider mustn't undo
 * what was already recorded. What the provider said isn't kept or shown either, since the mail can hold a customer's link.
 */
export async function mailCustomer(mail: { to: string; subject: string; text: string; replyTo?: string }): Promise<boolean> {
  try {
    const fields = await connectedFields(RESEND_CONNECTOR)
    if (!fields) return false
    await sendThroughResend({ apiKey: fields.apiKey, from: fields.sender }, mail)
    return true
  } catch (error) {
    if (error instanceof ResendRefusal && REFUSED_CREDENTIALS.includes(error.status)) await markFailing(RESEND_CONNECTOR, MAIL_REFUSED).catch(() => undefined)
    return false
  }
}
