import type { CollectionAfterChangeHook } from 'payload'

import { sendOrderCreatedEmails } from '@/utilities/email/notifications'

export const sendOrderCreatedEmailsHook: CollectionAfterChangeHook = async ({
  doc,
  operation,
  req,
}) => {
  if (operation !== 'create' || req.context?.skipOrderEmailNotifications) {
    return doc
  }

  try {
    await sendOrderCreatedEmails({
      order: doc,
      payload: req.payload,
    })
  } catch (error) {
    req.payload.logger.error({
      err: error,
      msg: `Failed to send order created emails for order ${String(doc.id)}`,
    })
  }

  return doc
}
