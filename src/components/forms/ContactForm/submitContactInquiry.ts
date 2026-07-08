'use server'

import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { sendContactInquiryEmail } from '@/utilities/email/notifications'

type SubmitContactInquiryArgs = {
  email: string
  message: string
  name: string
  phone?: string
  privacyAccepted: boolean
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
}: SubmitContactInquiryArgs): Promise<SubmitContactInquiryResult> {
  const payload = await getPayload({ config: configPromise })

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
