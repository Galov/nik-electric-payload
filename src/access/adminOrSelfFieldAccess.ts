import type { FieldAccess } from 'payload'

import { checkRole } from '@/access/utilities'

export const adminOrSelfFieldAccess: FieldAccess = ({ id, doc, req: { user } }) => {
  if (!user) {
    return false
  }

  if (checkRole(['admin'], user)) {
    return true
  }

  const normalizedId =
    typeof id === 'string' ? id : typeof doc?.id === 'string' ? doc.id : undefined

  return normalizedId === user.id
}
