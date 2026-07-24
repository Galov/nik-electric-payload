'use client'

import type { DefaultCellComponentProps } from 'payload'

import { useEffect, useState } from 'react'

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

export function ProductThumbnailCell({ cellData, rowData }: DefaultCellComponentProps) {
  const [failed, setFailed] = useState(false)
  const [mediaURL, setMediaURL] = useState('')
  const [isResolvingMedia, setIsResolvingMedia] = useState(false)
  const images = Array.isArray(cellData) ? (cellData as ProductImage[]) : []
  const firstImage = images[0]
  const directURL = getThumbnailURL(firstImage)
  const mediaID = typeof firstImage?.media === 'string' ? firstImage.media : ''
  const imageURL = directURL || mediaURL
  const editURL = `/admin/collections/products/${encodeURIComponent(String(rowData.id))}`

  useEffect(() => {
    setFailed(false)
  }, [imageURL])

  useEffect(() => {
    if (directURL || !mediaID) {
      setMediaURL('')
      setIsResolvingMedia(false)
      return
    }

    let isCancelled = false

    const resolveMediaURL = async () => {
      setMediaURL('')
      setIsResolvingMedia(true)

      try {
        const response = await fetch(
          `/api/media/${encodeURIComponent(mediaID)}?depth=0&select[url]=true`,
          {
            credentials: 'same-origin',
          },
        )

        if (!response.ok) {
          throw new Error('Media URL could not be loaded.')
        }

        const media = (await response.json()) as {
          url?: null | string
        }

        if (!isCancelled) {
          setMediaURL(media.url || '')
        }
      } catch {
        if (!isCancelled) {
          setMediaURL('')
          setFailed(true)
        }
      } finally {
        if (!isCancelled) {
          setIsResolvingMedia(false)
        }
      }
    }

    void resolveMediaURL()

    return () => {
      isCancelled = true
    }
  }, [directURL, mediaID])

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
          {isResolvingMedia ? (
            '…'
          ) : (
            <>
              Няма
              <br />
              снимка
            </>
          )}
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
