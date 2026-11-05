import 'server-only'

type MailSettings = { [key: string]: string | undefined; RESEND_API_KEY?: string; SOLDLYNE_MAIL_FROM?: string }

/** Whether this install can send its own mail at all. */
export const canSendOwnMail = (settings: MailSettings) => Boolean(settings.RESEND_API_KEY && settings.SOLDLYNE_MAIL_FROM)

/**
 * Soldlyne's own mail to its members (a link confirming an address, a forgotten password, an invitation), through
 * Resend (https://resend.com/docs/api-reference/emails/send-email). It never carries prospecting:
 * Resend's terms forbid cold email, and Soldlyne doesn't send any. An install without a key sends none.
 */
export async function sendOwnMail(settings: MailSettings, mail: { to: string; subject: string; text: string }): Promise<boolean> {
  if (!canSendOwnMail(settings)) return false
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${settings.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: settings.SOLDLYNE_MAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text }),
  })
  if (!response.ok) throw new Error(`Resend refused the mail (${response.status}): ${await response.text()}`)
  return true
}
