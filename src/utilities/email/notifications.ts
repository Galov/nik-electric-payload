import type { Payload, User } from 'payload'

import { getServerSideURL } from '@/utilities/getURL'

import {
  buildAdminOrderCreatedEmail,
  buildContactInquiryEmail,
  buildCustomerApprovedEmail,
  buildCustomerOrderCreatedEmail,
  buildCustomerOrderCompletedEmail,
  buildCustomerRegistrationEmail,
  buildMicroinvestExportFailedEmail,
} from './templates'
import { getAdminEmailRecipients, sendTransactionalEmail } from './send'

type OrderLike = Parameters<typeof buildAdminOrderCreatedEmail>[0]['order']

const getAdminURL = (collection: string, id?: number | string) => {
  const baseURL = getServerSideURL().replace(/\/$/, '')

  return `${baseURL}/admin/collections/${collection}${id ? `/${id}` : ''}`
}

const getOrderURL = (order: OrderLike) => {
  const baseURL = getServerSideURL().replace(/\/$/, '')
  const orderID = String(order.id || '')
  const params = new URLSearchParams()

  if (order.customerEmail) {
    params.set('email', order.customerEmail)
  }

  if (order.accessToken) {
    params.set('accessToken', order.accessToken)
  }

  const query = params.toString()

  return `${baseURL}/orders/${orderID}${query ? `?${query}` : ''}`
}

const sendAdminEmail = async ({
  html,
  payload,
  subject,
  text,
}: {
  html: string
  payload: Payload
  subject: string
  text: string
}) => {
  await sendTransactionalEmail({
    html,
    payload,
    subject,
    text,
    to: getAdminEmailRecipients(),
  })
}

export const sendOrderCreatedEmails = async ({
  order,
  payload,
}: {
  order: OrderLike
  payload: Payload
}) => {
  const adminEmail = buildAdminOrderCreatedEmail({
    adminURL: getAdminURL('orders', order.id),
    order,
  })

  await sendAdminEmail({ ...adminEmail, payload })

  if (!order.customerEmail) {
    return
  }

  const customerEmail = buildCustomerOrderCreatedEmail({
    order,
    orderURL: getOrderURL(order),
  })

  await sendTransactionalEmail({
    ...customerEmail,
    payload,
    to: order.customerEmail,
  })
}

export const sendOrderCompletedEmail = async ({
  order,
  payload,
}: {
  order: OrderLike
  payload: Payload
}) => {
  if (!order.customerEmail) {
    return
  }

  const customerEmail = buildCustomerOrderCompletedEmail({
    order,
    orderURL: getOrderURL(order),
  })

  await sendTransactionalEmail({
    ...customerEmail,
    payload,
    to: order.customerEmail,
  })
}

export const sendMicroinvestExportFailedEmail = async ({
  order,
  payload,
}: {
  order: OrderLike
  payload: Payload
}) => {
  const email = buildMicroinvestExportFailedEmail({
    adminURL: getAdminURL('orders', order.id),
    order,
  })

  await sendAdminEmail({ ...email, payload })
}

export const sendCustomerRegistrationEmail = async ({
  payload,
  user,
}: {
  payload: Payload
  user: User
}) => {
  const email = buildCustomerRegistrationEmail({
    adminURL: getAdminURL('users', user.id),
    user,
  })

  await sendAdminEmail({ ...email, payload })
}

export const sendCustomerApprovedEmail = async ({
  payload,
  user,
}: {
  payload: Payload
  user: User
}) => {
  if (!user.email) {
    return
  }

  const baseURL = getServerSideURL().replace(/\/$/, '')
  const email = buildCustomerApprovedEmail({
    loginURL: `${baseURL}/login`,
    user,
  })

  await sendTransactionalEmail({
    ...email,
    payload,
    to: user.email,
  })
}

export const sendContactInquiryEmail = async ({
  inquiry,
  payload,
}: {
  inquiry: Parameters<typeof buildContactInquiryEmail>[0]['inquiry']
  payload: Payload
}) => {
  const email = buildContactInquiryEmail({
    adminURL: getAdminURL('contact-inquiries', inquiry.id),
    inquiry,
  })

  await sendAdminEmail({ ...email, payload })
}
