import configPromise from '@payload-config'
import { ContactLocations } from '@/components/contact/ContactLocations'
import { generateMeta } from '@/utilities/generateMeta'
import { buildLocalBusinessSchemas } from '@/utilities/schema'
import { getPayload } from 'payload'
import React from 'react'

type ContactPageData = {
  meta?: {
    description?: string | null
    image?: { url?: string | null } | null
    title?: string | null
  } | null
  store: {
    address: string
    phone: string
    workingHours: string
  }
  title?: string
  warehouse: {
    address: string
    phone: string
    workingHours: string
  }
}

export async function generateMetadata() {
  const payload = await getPayload({ config: configPromise })
  const contactPage = (await payload.findGlobal({
    slug: 'contact-page' as never,
    depth: 1,
  })) as ContactPageData

  return generateMeta({
    doc: contactPage,
    fallbackDescription: 'Контакт с Ник Електрик, магазин, склад и полезна информация.',
    fallbackTitle: contactPage.title || 'Контакт',
    path: '/contact',
  })
}

export default async function ContactPage() {
  const payload = await getPayload({ config: configPromise })
  const contactPage = (await payload.findGlobal({
    slug: 'contact-page' as never,
  })) as ContactPageData

  const locations = [
    {
      label: 'Магазин',
      ...contactPage.store,
    },
    {
      label: 'Склад',
      ...contactPage.warehouse,
    },
  ] as const
  const localBusinessJsonLd = buildLocalBusinessSchemas(contactPage)

  return (
    <div className="container py-12 md:py-14">
      {localBusinessJsonLd.map((schema, index) => (
        <script
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(schema),
          }}
          key={index}
          type="application/ld+json"
        />
      ))}
      <div className="mb-10 max-w-3xl">
        <h1 className="text-3xl font-normal text-primary/85">{contactPage.title || 'Контакт'}</h1>
      </div>

      <ContactLocations locations={[locations[0], locations[1]]} />
    </div>
  )
}
