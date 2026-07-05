import type { CollectionAfterChangeHook } from 'payload'

import { sendCustomerApprovedEmail } from '@/utilities/email/notifications'

export const sendCustomerApprovedEmailHook: CollectionAfterChangeHook = async ({
  doc,
  operation,
  previousDoc,
  req,
}) => {
  if (operation !== 'update' || req.context?.skipCustomerApprovedEmail) {
    return doc
  }

  const wasApproved = previousDoc?.approved === true
  const isApproved = doc?.approved === true

  if (wasApproved || !isApproved) {
    return doc
  }

  try {
    await sendCustomerApprovedEmail({
      payload: req.payload,
      user: doc,
    })
  } catch (error) {
    req.payload.logger.error({
      err: error,
      msg: `Failed to send customer approved email for user ${String(doc.id)}`,
    })
  }

  return doc
}
