'use client'

import type { DefaultCellComponentProps } from 'payload'

import { useState } from 'react'

type ProductImage = {
  alt?: null | string
  legacyUrl?: null | string
  media?:
    | {
        url?: null | string
      }
    | null
    | string
  storageKey?: null | string
}

const publicStorageBase = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || ''

const getThumbnailURL = (image?: ProductImage) => {
  if (!image) return ''

  if (image.storageKey && publicStorageBase) {
    return `${publicStorageBase.replace(/\/$/, '')}/${image.storageKey.replace(/^\//, '')}`
  }

  if (image.media && typeof image.media === 'object' && image.media.url) {
    return image.media.url
  }

  return image.legacyUrl || ''
}

export function ProductThumbnailCell({ cellData }: DefaultCellComponentProps) {
  const [failed, setFailed] = useState(false)
  const images = Array.isArray(cellData) ? (cellData as ProductImage[]) : []
  const firstImage = images[0]
  const imageURL = getThumbnailURL(firstImage)

  if (!imageURL || failed) {
    return (
      <div
        aria-label="Няма снимка"
        style={{
          alignItems: 'center',
          background: 'var(--theme-elevation-50)',
          border: '1px dashed var(--theme-elevation-250)',
          borderRadius: '4px',
          color: 'var(--theme-elevation-500)',
          display: 'flex',
          fontSize: '9px',
          height: '48px',
          justifyContent: 'center',
          lineHeight: 1.1,
          textAlign: 'center',
          width: '48px',
        }}
      >
        Няма
        <br />
        снимка
      </div>
    )
  }

  return (
    <img
      alt={firstImage?.alt || 'Продуктова снимка'}
      height={48}
      loading="lazy"
      onError={() => setFailed(true)}
      src={imageURL}
      style={{
        background: 'white',
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: '4px',
        display: 'block',
        height: '48px',
        objectFit: 'contain',
        width: '48px',
      }}
      width={48}
    />
  )
}
