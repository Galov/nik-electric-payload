import type { CollectionAfterChangeHook } from 'payload'

import { sendCustomerRegistrationEmail } from '@/utilities/email/notifications'

export const sendCustomerRegistrationEmailHook: CollectionAfterChangeHook = async ({
  doc,
  operation,
  req,
}) => {
  if (operation !== 'create' || req.context?.skipCustomerRegistrationEmail) {
    return doc
  }

  try {
    await sendCustomerRegistrationEmail({
      payload: req.payload,
      user: doc,
    })
  } catch (error) {
    req.payload.logger.error({
      err: error,
      msg: `Failed to send customer registration email for user ${String(doc.id)}`,
    })
  }

  return doc
}
