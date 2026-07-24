import type { CollectionConfig, Endpoint } from 'payload'

import {
  FixedToolbarFeature,
  InlineToolbarFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'
import path from 'path'
import { fileURLToPath } from 'url'

import { adminOnly } from '@/access/adminOnly'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const mediaThumbnailEndpoint: Endpoint = {
  path: '/:id/thumbnail',
  method: 'get',
  handler: async (req) => {
    const id = String(req.routeParams?.id || '')

    if (!id) {
      return Response.json({ message: 'Media ID is required.' }, { status: 400 })
    }

    try {
      const media = await req.payload.findByID({
        id,
        collection: 'media',
        depth: 0,
        overrideAccess: false,
        req,
      })

      if (!media.url) {
        return Response.json({ message: 'Media file was not found.' }, { status: 404 })
      }

      const requestURL = new URL(req.url || 'http://localhost')
      const forwardedHost = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
      const forwardedProtocol = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
      const publicOrigin = forwardedHost
        ? `${forwardedProtocol || requestURL.protocol.replace(':', '')}://${forwardedHost}`
        : requestURL.origin

      return Response.redirect(new URL(media.url, publicOrigin), 307)
    } catch {
      return Response.json({ message: 'Media file was not found.' }, { status: 404 })
    }
  },
}

export const Media: CollectionConfig = {
  admin: {
    group: 'Съдържание',
    defaultColumns: ['filename', 'alt', 'updatedAt'],
  },
  labels: {
    plural: 'Медия',
    singular: 'Медия',
  },
  slug: 'media',
  access: {
    create: adminOnly,
    delete: adminOnly,
    read: () => true,
    update: adminOnly,
  },
  fields: [
    {
      name: 'alt',
      label: 'Alt текст',
      type: 'text',
    },
    {
      name: 'caption',
      label: 'Надпис',
      type: 'richText',
      editor: lexicalEditor({
        features: ({ rootFeatures }) => {
          return [...rootFeatures, FixedToolbarFeature(), InlineToolbarFeature()]
        },
      }),
    },
  ],
  endpoints: [mediaThumbnailEndpoint],
  upload: {
    staticDir: path.resolve(dirname, '../../public/media'),
  },
}
