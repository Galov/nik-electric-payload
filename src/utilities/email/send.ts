import type { Payload } from 'payload'

type SendEmailArgs = {
  html: string
  subject: string
  text: string
  to: string | string[]
}

const parseRecipients = (value?: null | string) =>
  (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

export const isEmailEnabled = () => process.env.EMAIL_ENABLED === 'true'

export const getAdminEmailRecipients = () =>
  parseRecipients(process.env.EMAIL_ADMIN_TO || process.env.ADMIN_EMAIL_TO || process.env.EMAIL_TO)

export const getBccEmailRecipients = () => parseRecipients(process.env.EMAIL_BCC_TO)

export const sendTransactionalEmail = async ({
  html,
  payload,
  subject,
  text,
  to,
}: SendEmailArgs & { payload: Payload }) => {
  if (!isEmailEnabled()) {
    payload.logger.info(`Email disabled. Skipping: ${subject}`)
    return
  }

  const recipients = Array.isArray(to) ? to.filter(Boolean) : parseRecipients(to)
  const bccRecipients = getBccEmailRecipients()

  if (!recipients.length) {
    payload.logger.warn(`Email recipient missing. Skipping: ${subject}`)
    return
  }

  await payload.sendEmail({
    html,
    ...(bccRecipients.length ? { bcc: bccRecipients } : {}),
    subject,
    text,
    to: recipients,
  })
}
