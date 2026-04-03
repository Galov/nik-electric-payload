import type { CollectionConfig } from 'payload'

import { adminOnly } from '@/access/adminOnly'
import { adminOnlyFieldAccess } from '@/access/adminOnlyFieldAccess'
import { adminOrSelfFieldAccess } from '@/access/adminOrSelfFieldAccess'
import { adminOrSelf } from '@/access/adminOrSelf'
import { publicAccess } from '@/access/publicAccess'
import { checkRole } from '@/access/utilities'
import { APIError } from 'payload'

import { ensureFirstUserIsAdmin } from './hooks/ensureFirstUserIsAdmin'

export const Users: CollectionConfig = {
  slug: 'users',
  access: {
    admin: ({ req: { user } }) => checkRole(['admin'], user),
    create: publicAccess,
    delete: adminOnly,
    read: adminOrSelf,
    unlock: adminOnly,
    update: adminOrSelf,
  },
  admin: {
    group: 'Потребители',
    defaultColumns: ['name', 'email', 'priceTier', 'approved', 'roles'],
    useAsTitle: 'name',
  },
  labels: {
    plural: 'Потребители',
    singular: 'Потребител',
  },
  auth: {
    tokenExpiration: 1209600,
  },
  hooks: {
    beforeChange: [
      ({ data }) => {
        if (!data) {
          return data
        }

        const personalName = [data.firstName, data.lastName]
          .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
          .join(' ')
          .trim()

        data.name = personalName || data.email || data.name

        return data
      },
    ],
    beforeLogin: [
      ({ user }) => {
        if (checkRole(['admin'], user)) {
          return user
        }

        if (user?.approved === false) {
          throw new APIError('Профилът ви все още не е одобрен от администратор.', 403)
        }

        return user
      },
    ],
  },
  fields: [
    {
      name: 'name',
      label: 'Име',
      type: 'text',
      admin: {
        hidden: true,
      },
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Фирмени данни',
          fields: [
            {
              type: 'row',
              fields: [
                {
                  name: 'companyName',
                  label: 'Име на фирма',
                  type: 'text',
                  required: true,
                  admin: {
                    width: '50%',
                  },
                },
                {
                  name: 'companyEIK',
                  label: 'ЕИК',
                  type: 'text',
                  required: true,
                  admin: {
                    width: '50%',
                  },
                },
              ],
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'companyCity',
                  label: 'Град',
                  type: 'text',
                  required: true,
                  admin: {
                    width: '50%',
                  },
                },
                {
                  name: 'phone',
                  label: 'Телефон',
                  type: 'text',
                  required: true,
                  admin: {
                    width: '50%',
                  },
                },
              ],
            },
            {
              name: 'companyAddress',
              label: 'Адрес',
              type: 'textarea',
              required: true,
            },
          ],
        },
        {
          label: 'Лице за контакт',
          fields: [
            {
              type: 'row',
              fields: [
                {
                  name: 'firstName',
                  label: 'Име',
                  type: 'text',
                  required: true,
                  admin: {
                    width: '50%',
                  },
                },
                {
                  name: 'lastName',
                  label: 'Фамилия',
                  type: 'text',
                  required: true,
                  admin: {
                    width: '50%',
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    {
      name: 'roles',
      label: 'Роли',
      type: 'select',
      access: {
        create: adminOnlyFieldAccess,
        read: adminOnlyFieldAccess,
        update: adminOnlyFieldAccess,
      },
      defaultValue: ['customer'],
      hasMany: true,
      hooks: {
        beforeChange: [ensureFirstUserIsAdmin],
      },
      options: [
        {
          label: 'Клиент',
          value: 'customer',
        },
        {
          label: 'Администратор',
          value: 'admin',
        },
      ],
    },
    {
      name: 'approved',
      label: 'Одобрен',
      type: 'checkbox',
      defaultValue: false,
      access: {
        create: adminOnlyFieldAccess,
        read: adminOnlyFieldAccess,
        update: adminOnlyFieldAccess,
      },
    },
    {
      name: 'partnerCode',
      label: 'Код на партньор',
      type: 'text',
      access: {
        create: adminOnlyFieldAccess,
        read: adminOrSelfFieldAccess,
        update: adminOnlyFieldAccess,
      },
    },
    {
      name: 'priceTier',
      label: 'Ценова група',
      type: 'select',
      defaultValue: 'general',
      access: {
        create: adminOnlyFieldAccess,
        read: adminOrSelfFieldAccess,
        update: adminOnlyFieldAccess,
      },
      options: [
        {
          label: 'Обща',
          value: 'general',
        },
        {
          label: 'Ценова група 1',
          value: 'group1',
        },
      ],
    },
    {
      name: 'orders',
      label: 'Поръчки',
      type: 'join',
      collection: 'orders',
      on: 'customer',
      admin: {
        allowCreate: false,
        defaultColumns: ['id', 'createdAt', 'amount', 'currency', 'items'],
      },
    },
    {
      name: 'cart',
      label: 'Количка',
      type: 'join',
      collection: 'carts',
      on: 'customer',
      admin: {
        allowCreate: false,
        defaultColumns: ['id', 'createdAt', 'subtotal', 'currency', 'items'],
      },
    },
    {
      name: 'addresses',
      label: 'Адреси',
      type: 'join',
      collection: 'addresses',
      on: 'customer',
      admin: {
        allowCreate: false,
        defaultColumns: ['id'],
      },
    },
  ],
}
