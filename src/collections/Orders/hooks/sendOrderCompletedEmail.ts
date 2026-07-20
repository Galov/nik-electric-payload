import type { CollectionAfterChangeHook } from 'payload'

import { sendOrderCompletedEmail } from '@/utilities/email/notifications'

export const sendOrderCompletedEmailHook: CollectionAfterChangeHook = async ({
  doc,
  operation,
  previousDoc,
  req,
}) => {
  const changedToCompleted =
    operation === 'update' && doc.status === 'completed' && previousDoc?.status !== 'completed'

  if (!changedToCompleted || req.context?.skipOrderEmailNotifications) {
    return doc
  }

  try {
    await sendOrderCompletedEmail({
      order: doc,
      payload: req.payload,
    })
  } catch (error) {
    req.payload.logger.error({
      err: error,
      msg: `Failed to send order completed email for order ${String(doc.id)}`,
    })
  }

  return doc
}
