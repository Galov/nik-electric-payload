import type { CollectionBeforeChangeHook } from 'payload'
import { APIError } from 'payload'

import { checkRole } from '@/access/utilities'
import {
  buildBlockedAttemptLog,
  getAntiSpamSubmitDelay,
  hasSuspiciousContent,
  isTooFastSubmit,
} from '@/utilities/antiSpam'

type RegistrationData = {
  companyAddress?: string
  companyCity?: string
  companyEIK?: string
  companyName?: string
  email?: string
  firstName?: string
  lastName?: string
  phone?: string
  submittedAt?: number
  website?: string
}

const stripAntiSpamFields = (data: RegistrationData) => {
  delete data.website
  delete data.submittedAt
}

export const blockSpamRegistration: CollectionBeforeChangeHook = ({ data, operation, req }) => {
  if (!data || operation !== 'create') {
    return data
  }

  const registrationData = data as RegistrationData
  const headers = req.headers
  const submittedAt = registrationData.submittedAt
  const website = registrationData.website

  if (!headers || checkRole(['admin'], req.user)) {
    stripAntiSpamFields(registrationData)
    return data
  }

  const name = [registrationData.firstName, registrationData.lastName]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ')
    .trim()
  const message = [
    registrationData.companyName,
    registrationData.companyEIK,
    registrationData.companyCity,
    registrationData.companyAddress,
    registrationData.firstName,
    registrationData.lastName,
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join('\n')
  const email = registrationData.email || ''
  const phone = registrationData.phone
  const submitDelay = getAntiSpamSubmitDelay(submittedAt)

  stripAntiSpamFields(registrationData)

  if (website?.trim()) {
    req.payload.logger.warn(
      buildBlockedAttemptLog({
        email,
        headers,
        message,
        name,
        phone,
        reason: 'honeypot',
        submitDelay,
      }),
    )
    throw new APIError('Регистрацията не беше приета. Моля, проверете данните и опитайте отново.', 400)
  }

  if (isTooFastSubmit(submitDelay)) {
    req.payload.logger.warn(
      buildBlockedAttemptLog({
        email,
        headers,
        message,
        name,
        phone,
        reason: 'too_fast',
        submitDelay,
      }),
    )
    throw new APIError(
      'Формата беше изпратена твърде бързо. Моля, изчакайте малко и опитайте отново.',
      400,
    )
  }

  if (hasSuspiciousContent({ email, message, name, phone })) {
    req.payload.logger.warn(
      buildBlockedAttemptLog({
        email,
        headers,
        message,
        name,
        phone,
        reason: 'suspicious_content',
        submitDelay,
      }),
    )
    throw new APIError('Регистрацията не беше приета. Моля, проверете данните и опитайте отново.', 400)
  }

  return data
}
