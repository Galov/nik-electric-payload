import { slugField } from 'payload'
import type { CollectionConfig } from 'payload'

import { adminOnly } from '@/access/adminOnly'

export const Categories: CollectionConfig = {
  slug: 'categories',
  access: {
    create: adminOnly,
    delete: adminOnly,
    read: () => true,
    update: adminOnly,
  },
  admin: {
    useAsTitle: 'title',
    group: 'Каталог',
  },
  labels: {
    plural: 'Категории',
    singular: 'Категория',
  },
  fields: [
    {
      name: 'sourceTermId',
      label: 'ID на изходния термин',
      type: 'number',
      index: true,
      unique: true,
    },
    {
      name: 'sourceTaxonomyId',
      label: 'ID на изходната таксономия',
      type: 'number',
      index: true,
      unique: true,
    },
    {
      name: 'title',
      label: 'Име',
      type: 'text',
      required: true,
    },
    {
      name: 'parent',
      label: 'Родителска категория',
      type: 'relationship',
      relationTo: 'categories',
    },
    {
      name: 'productCount',
      label: 'Брой продукти',
      type: 'number',
      defaultValue: 0,
    },
    slugField({
      position: undefined,
    }),
  ],
}
