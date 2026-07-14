export type AntiSpamReason = 'honeypot' | 'suspicious_content' | 'too_fast'

export type AntiSpamContext = {
  email: string
  headers: Headers
  message: string
  name: string
  phone?: string
  reason: AntiSpamReason
  submitDelay?: number
}

const MIN_SUBMIT_DELAY_MS = 2500
const MAX_MESSAGE_LENGTH = 4000
const MAX_NAME_LENGTH = 120
const MAX_PHONE_LENGTH = 40
const MAX_LINK_COUNT = 2

const suspiciousPatterns = [
  'viagra',
  'casino',
  'crypto',
  'forex',
  'seo service',
  'backlinks',
  'telegram',
  'whatsapp',
]

export const getAntiSpamSubmitDelay = (submittedAt?: number) => {
  const now = Date.now()
  return Number.isFinite(submittedAt) ? now - Number(submittedAt) : 0
}

export const isTooFastSubmit = (submitDelay: number) => submitDelay < MIN_SUBMIT_DELAY_MS

export const maskEmail = (value?: string) => {
  const trimmed = value?.trim().toLowerCase()

  if (!trimmed || !trimmed.includes('@')) {
    return 'unknown'
  }

  const [localPart, domain] = trimmed.split('@')
  const visibleLocalPart = localPart.slice(0, 2)
  const maskedLocalPart = `${visibleLocalPart}${'*'.repeat(Math.max(localPart.length - visibleLocalPart.length, 1))}`

  return `${maskedLocalPart}@${domain}`
}

export const getClientIP = (headers: Headers) => {
  const forwardedFor = headers.get('x-forwarded-for')
  const realIP = headers.get('x-real-ip')
  const cloudflareIP = headers.get('cf-connecting-ip')

  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || 'unknown'
  }

  return cloudflareIP || realIP || 'unknown'
}

export const buildBlockedAttemptLog = ({
  email,
  headers,
  message,
  name,
  phone,
  reason,
  submitDelay,
}: AntiSpamContext) => ({
  msg: 'Public form submission blocked by anti-spam protection.',
  reason,
  emailMasked: maskEmail(email),
  ip: getClientIP(headers),
  messageLength: message.trim().length,
  messagePreview: message.trim().slice(0, 80),
  name: name.trim().slice(0, 80),
  phoneProvided: Boolean(phone?.trim()),
  submitDelay,
  userAgent: headers.get('user-agent') || 'unknown',
})

const countLinks = (value: string) => {
  const matches = value.match(/https?:\/\//gi)
  return matches ? matches.length : 0
}

export const hasSuspiciousContent = ({
  email,
  message,
  name,
  phone,
}: {
  email: string
  message: string
  name: string
  phone?: string
}) => {
  const normalizedMessage = message.trim().toLowerCase()
  const normalizedName = name.trim().toLowerCase()
  const normalizedEmail = email.trim().toLowerCase()
  const normalizedPhone = phone?.trim() || ''

  if (
    !normalizedName ||
    !normalizedMessage ||
    !normalizedEmail ||
    name.length > MAX_NAME_LENGTH ||
    normalizedMessage.length > MAX_MESSAGE_LENGTH ||
    normalizedPhone.length > MAX_PHONE_LENGTH
  ) {
    return true
  }

  if (countLinks(normalizedMessage) > MAX_LINK_COUNT) {
    return true
  }

  if (suspiciousPatterns.some((pattern) => normalizedMessage.includes(pattern))) {
    return true
  }

  if (
    normalizedName.includes('http') ||
    normalizedEmail.includes('http') ||
    normalizedPhone.includes('http')
  ) {
    return true
  }

  return false
}
