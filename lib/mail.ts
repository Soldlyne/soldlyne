import 'server-only'

type MailSettings = { [key: string]: string | undefined; RESEND_API_KEY?: string; SOLDLYNE_MAIL_FROM?: string }

type Mail = { to: string; subject: string; text: string; replyTo?: string }

export class ResendRefusal extends Error {
  constructor(
    public status: number,
    detail: string,
  ) {
    super(`Resend refused the mail (${status}): ${detail}`)
  }
}

/** One mail through a Resend account (https://resend.com/docs/api-reference/emails/send-email). Never prospecting: Resend's terms forbid cold email, and Soldlyne doesn't send any. */
export async function sendThroughResend(account: { apiKey: string; from: string }, mail: Mail): Promise<void> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${account.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: account.from, to: [mail.to], subject: mail.subject, text: mail.text, ...(mail.replyTo ? { reply_to: mail.replyTo } : {}) }),
  })
  if (!response.ok) throw new ResendRefusal(response.status, await response.text())
}

/** Whether this install can send its own mail at all. */
export const canSendOwnMail = (settings: MailSettings) => Boolean(settings.RESEND_API_KEY && settings.SOLDLYNE_MAIL_FROM)

/**
 * The install's own mail to its members, which has to work before any workspace exists: a link confirming
 * an address, a forgotten password, an invitation. A company's mail to its customers goes through that
 * company's connector instead (lib/connectors/customer-mail.ts). An install without a key sends none.
 */
export async function sendOwnMail(settings: MailSettings, mail: Mail): Promise<boolean> {
  if (!canSendOwnMail(settings)) return false
  await sendThroughResend({ apiKey: settings.RESEND_API_KEY as string, from: settings.SOLDLYNE_MAIL_FROM as string }, mail)
  return true
}
