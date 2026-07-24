'use client'

import type { DefaultCellComponentProps } from 'payload'

import { useEffect, useState } from 'react'

type MediaValue =
  | {
      _id?: null | string
      id?: null | string
      url?: null | string
      value?:
        | {
            id?: null | string
          }
        | null
        | string
    }
  | null
  | string

type ProductImage = {
  alt?: null | string
  legacyUrl?: null | string
  media?: MediaValue
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

const getMediaID = (media?: MediaValue) => {
  if (typeof media === 'string') return media
  if (!media || typeof media !== 'object') return ''
  if (typeof media.id === 'string') return media.id
  if (typeof media._id === 'string') return media._id
  if (typeof media.value === 'string') return media.value
  if (media.value && typeof media.value === 'object' && typeof media.value.id === 'string') {
    return media.value.id
  }

  return ''
}

export function ProductThumbnailCell({ cellData, rowData }: DefaultCellComponentProps) {
  const [failed, setFailed] = useState(false)
  const images = Array.isArray(cellData) ? (cellData as ProductImage[]) : []
  const firstImage = images[0]
  const directURL = getThumbnailURL(firstImage)
  const mediaID = getMediaID(firstImage?.media)
  const imageURL =
    directURL || (mediaID ? `/api/media/${encodeURIComponent(mediaID)}/thumbnail` : '')
  const editURL = `/admin/collections/products/${encodeURIComponent(String(rowData.id))}`

  useEffect(() => {
    setFailed(false)
  }, [imageURL])

  if (!imageURL || failed) {
    return (
      <a
        aria-label="Отвори продукта за редакция"
        href={editURL}
        style={{
          display: 'inline-block',
          textDecoration: 'none',
        }}
      >
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
      </a>
    )
  }

  return (
    <a
      aria-label="Отвори продукта за редакция"
      href={editURL}
      style={{
        display: 'inline-block',
      }}
    >
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
    </a>
  )
}
