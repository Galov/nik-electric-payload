import type { GlobalConfig } from 'payload'

import { adminOnly } from '@/access/adminOnly'

const bannerSlideFields = () => [
  {
    name: 'image',
    label: 'Изображение',
    type: 'upload' as const,
    relationTo: 'media' as const,
  },
  {
    name: 'url',
    label: 'Линк',
    type: 'text' as const,
    admin: {
      description: 'Незадължително. Ако е попълнен, банерът ще води към този адрес.',
    },
  },
  {
    name: 'openInNewTab',
    label: 'Отвори в нов раздел',
    type: 'checkbox' as const,
    defaultValue: false,
  },
]

const bannerFields = (label: string) => ({
  name: 'bottomBanner',
  label,
  type: 'group' as const,
  fields: [
    ...bannerSlideFields(),
  ],
})

export const ShopPage: GlobalConfig = {
  slug: 'shopPage',
  label: 'Каталог',
  access: {
    read: () => true,
    update: adminOnly,
  },
  admin: {
    group: 'Сайт',
  },
  fields: [
    {
      name: 'topBanners',
      label: 'Горен банер (слайдове)',
      type: 'array',
      labels: {
        plural: 'Слайдове',
        singular: 'Слайд',
      },
      admin: {
        description: 'Добави едно или повече изображения за горния слайдър на каталога.',
      },
      fields: bannerSlideFields(),
    },
    bannerFields('Долен банер'),
  ],
}
