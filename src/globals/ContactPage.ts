import type { GlobalConfig } from 'payload'

import { adminOnly } from '@/access/adminOnly'
import { buildSEOFields } from '@/fields/seo'

const locationFields = (label: string) => ({
  name: label === 'Магазин' ? 'store' : 'warehouse',
  label,
  type: 'group' as const,
  fields: [
    {
      name: 'address',
      label: 'Адрес',
      type: 'textarea' as const,
      required: true,
    },
    {
      name: 'phone',
      label: 'Телефон',
      type: 'text' as const,
      required: true,
    },
    {
      name: 'workingHours',
      label: 'Работно време',
      type: 'textarea' as const,
      required: true,
    },
    {
      type: 'row' as const,
      fields: [
        {
          name: 'latitude',
          label: 'Ширина (latitude)',
          type: 'number' as const,
          admin: {
            step: 0.000001,
          },
        },
        {
          name: 'longitude',
          label: 'Дължина (longitude)',
          type: 'number' as const,
          admin: {
            step: 0.000001,
          },
        },
      ],
    },
  ],
})

export const ContactPage: GlobalConfig = {
  slug: 'contact-page',
  label: 'Контакт',
  access: {
    read: () => true,
    update: adminOnly,
  },
  admin: {
    group: 'Съдържание',
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Съдържание',
          fields: [
            {
              name: 'title',
              label: 'Заглавие',
              type: 'text',
              defaultValue: 'Контакт',
              required: true,
            },
            locationFields('Магазин'),
            locationFields('Склад'),
          ],
        },
        {
          name: 'meta',
          label: 'SEO',
          fields: buildSEOFields(),
        },
      ],
    },
  ],
}
