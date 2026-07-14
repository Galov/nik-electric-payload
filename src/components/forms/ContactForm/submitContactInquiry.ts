'use server'

import configPromise from '@payload-config'
import { headers as getHeaders } from 'next/headers'
import { getPayload } from 'payload'

import { sendContactInquiryEmail } from '@/utilities/email/notifications'
import {
  buildBlockedAttemptLog,
  getAntiSpamSubmitDelay,
  hasSuspiciousContent,
  isTooFastSubmit,
} from '@/utilities/antiSpam'

type SubmitContactInquiryArgs = {
  email: string
  message: string
  name: string
  phone?: string
  privacyAccepted: boolean
  submittedAt: number
  website?: string
}

type SubmitContactInquiryResult = {
  error?: string
  success: boolean
}

export async function submitContactInquiry({
  email,
  message,
  name,
  phone,
  privacyAccepted,
  submittedAt,
  website,
}: SubmitContactInquiryArgs): Promise<SubmitContactInquiryResult> {
  const headers = await getHeaders()
  const payload = await getPayload({ config: configPromise })
  const normalizedWebsite = website?.trim() || ''
  const submitDelay = getAntiSpamSubmitDelay(submittedAt)

  if (normalizedWebsite) {
    payload.logger.warn(
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
    return { success: true }
  }

  if (isTooFastSubmit(submitDelay)) {
    payload.logger.warn(
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
    return {
      success: false,
      error: 'Формата беше изпратена твърде бързо. Моля, изчакайте малко и опитайте отново.',
    }
  }

  if (hasSuspiciousContent({ email, message, name, phone })) {
    payload.logger.warn(
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
    return {
      success: false,
      error: 'Съобщението не беше изпратено. Моля, проверете данните и опитайте отново.',
    }
  }

  if (!privacyAccepted) {
    return {
      success: false,
      error: 'Трябва да потвърдите, че сте съгласни с политиката за поверителност.',
    }
  }

  try {
    const inquiry = await payload.create({
      collection: 'contact-inquiries' as never,
      data: {
        email,
        message,
        name,
        phone,
        privacyAccepted,
      } as never,
      overrideAccess: true,
    })

    await sendContactInquiryEmail({
      inquiry,
      payload,
    })

    return { success: true }
  } catch (err) {
    payload.logger.error({ msg: 'Failed to create contact inquiry', err })
    return {
      success: false,
      error: 'Възникна проблем при изпращането на запитването. Моля, опитайте отново.',
    }
  }
}
