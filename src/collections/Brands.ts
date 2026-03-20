import { adminOnly } from '@/access/adminOnly'
import { slugField } from 'payload'
import type { CollectionConfig } from 'payload'

export const Brands: CollectionConfig = {
  slug: 'brands',
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
    plural: 'Марки',
    singular: 'Марка',
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
