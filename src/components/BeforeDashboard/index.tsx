import configPromise from '@payload-config'
import { Banner } from '@payloadcms/ui'
import { getPayload } from 'payload'
import { unstable_noStore as noStore } from 'next/cache'
import Link from 'next/link'
import React from 'react'

import './index.scss'

const baseClass = 'before-dashboard'
const ordersAdminPath = '/admin/collections/orders'

const buildOrdersLabel = (count: number, singular: string, plural: string) =>
  count === 1 ? singular : plural

const processingOrdersURL = `${ordersAdminPath}?where[status][equals]=processing`
const heldOrdersURL = `${ordersAdminPath}?where[status][equals]=held`
const failedOrdersURL = `${ordersAdminPath}?where[miOrderExportStatus][equals]=failed`

export const BeforeDashboard = async () => {
  noStore()

  const payload = await getPayload({ config: configPromise })

  const [{ totalDocs: failedOrders }, { totalDocs: heldOrders }, { totalDocs: processingOrders }] =
    await Promise.all([
      payload.count({
        collection: 'orders',
        overrideAccess: true,
        where: {
          miOrderExportStatus: {
            equals: 'failed',
          },
        },
      }),
      payload.count({
        collection: 'orders',
        overrideAccess: true,
        where: {
          status: {
            equals: 'held',
          },
        },
      }),
      payload.count({
        collection: 'orders',
        overrideAccess: true,
        where: {
          status: {
            equals: 'processing',
          },
        },
      }),
    ])

  return (
    <div className={baseClass}>
      {failedOrders > 0 && (
        <Banner className={`${baseClass}__banner`} type="error">
          Имате {failedOrders} {buildOrdersLabel(failedOrders, 'грешна поръчка', 'грешни поръчки')}.
          Проверете ги възможно най-скоро.
        </Banner>
      )}

      <div className={`${baseClass}__grid`}>
        <div className={`${baseClass}__card`}>
          <p className={`${baseClass}__eyebrow`}>Неприключени поръчки</p>
          <p className={`${baseClass}__value`}>{processingOrders}</p>
          <p className={`${baseClass}__description`}>
            Имате {processingOrders}{' '}
            {buildOrdersLabel(processingOrders, 'неприключена поръчка', 'неприключени поръчки')}.
          </p>
          <Link className={`${baseClass}__link`} href={processingOrdersURL}>
            Отвори неприключените
          </Link>
        </div>

        <div className={`${baseClass}__card`}>
          <p className={`${baseClass}__eyebrow`}>Задържани поръчки</p>
          <p
            className={`${baseClass}__value ${heldOrders > 0 ? `${baseClass}__value--warning` : ''}`}
          >
            {heldOrders}
          </p>
          <p className={`${baseClass}__description`}>
            Имате {heldOrders}{' '}
            {buildOrdersLabel(heldOrders, 'задържана поръчка', 'задържани поръчки')}.
          </p>
          <Link className={`${baseClass}__link`} href={heldOrdersURL}>
            Отвори задържаните
          </Link>
        </div>

        <div className={`${baseClass}__card`}>
          <p className={`${baseClass}__eyebrow`}>Грешни поръчки</p>
          <p
            className={`${baseClass}__value ${failedOrders > 0 ? `${baseClass}__value--danger` : ''}`}
          >
            {failedOrders}
          </p>
          <p className={`${baseClass}__description`}>
            Имате {failedOrders}{' '}
            {buildOrdersLabel(failedOrders, 'грешна поръчка', 'грешни поръчки')}.
          </p>
          <Link className={`${baseClass}__link`} href={failedOrdersURL}>
            Отвори грешните
          </Link>
        </div>
      </div>
    </div>
  )
}
