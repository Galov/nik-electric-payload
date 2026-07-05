'use client'

import type { UIFieldClientComponent } from 'payload'

import { FieldLabel, useForm, useFormFields } from '@payloadcms/ui'
import { useEffect, useMemo, useState } from 'react'

type MediaValue =
  | string
  | {
      alt?: null | string
      url?: null | string
    }
  | null

type ImageRow = {
  alt?: null | string
  legacyUrl?: null | string
  media?: MediaValue
  storageKey?: null | string
}

const publicStorageBase = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || ''

const getParentPath = (path?: string) => {
  if (!path) return ''

  const parts = path.split('.')
  parts.pop()

  return parts.join('.')
}

const getStorageURL = (storageKey?: null | string) => {
  if (!storageKey || !publicStorageBase) return ''

  return `${publicStorageBase.replace(/\/$/, '')}/${storageKey.replace(/^\//, '')}`
}

const getMediaURL = (media?: MediaValue) => {
  if (media && typeof media === 'object' && media.url) return media.url

  return ''
}

const getPreviewLabel = (row: ImageRow, imageUrl: string) => {
  if (!imageUrl) return 'Няма наличен URL за преглед.'
  if (row.storageKey && getStorageURL(row.storageKey) === imageUrl) return 'R2 снимка'
  if (getMediaURL(row.media) === imageUrl) return 'Payload media снимка'

  return 'Legacy URL снимка'
}

export const ProductImagePreviewField: UIFieldClientComponent = ({ path }) => {
  const rowPath = useMemo(() => getParentPath(path), [path])
  const { getDataByPath } = useForm()

  useFormFields(([fields]) => {
    if (!rowPath) return null

    return {
      legacyUrl: fields[`${rowPath}.legacyUrl`]?.value,
      media: fields[`${rowPath}.media`]?.value,
      storageKey: fields[`${rowPath}.storageKey`]?.value,
    }
  })

  const row = (rowPath ? getDataByPath(rowPath) : null) as ImageRow | null
  const media = row?.media || null
  const [mediaUrl, setMediaUrl] = useState('')

  useEffect(() => {
    if (!media || typeof media !== 'string') {
      setMediaUrl('')
      return
    }

    let isCancelled = false

    const loadMedia = async () => {
      try {
        const response = await fetch(
          `/api/media/${encodeURIComponent(media)}?depth=0&select[url]=true`,
          { credentials: 'include' },
        )

        if (!response.ok) return

        const nextMedia = (await response.json()) as { url?: null | string }

        if (!isCancelled) {
          setMediaUrl(nextMedia.url || '')
        }
      } catch {
        if (!isCancelled) {
          setMediaUrl('')
        }
      }
    }

    void loadMedia()

    return () => {
      isCancelled = true
    }
  }, [media])

  const imageUrl = getStorageURL(row?.storageKey) || getMediaURL(media) || mediaUrl || row?.legacyUrl || ''
  const label = getPreviewLabel(row || {}, imageUrl)

  return (
    <div className="field-type" style={{ marginBottom: '1rem' }}>
      <FieldLabel label="Преглед" />
      {imageUrl ? (
        <div
          style={{
            alignItems: 'flex-start',
            display: 'flex',
            gap: '0.75rem',
          }}
        >
          <a href={imageUrl} rel="noreferrer" target="_blank">
            <img
              alt={row?.alt || 'Преглед на продуктова снимка'}
              src={imageUrl}
              style={{
                background: 'var(--theme-elevation-50)',
                border: '1px solid var(--theme-elevation-150)',
                borderRadius: '6px',
                display: 'block',
                height: '96px',
                objectFit: 'contain',
                width: '128px',
              }}
            />
          </a>
          <div
            style={{
              color: 'var(--theme-elevation-600)',
              fontSize: '0.875rem',
              lineHeight: 1.4,
              paddingTop: '0.25rem',
              wordBreak: 'break-all',
            }}
          >
            <div>{label}</div>
            <a href={imageUrl} rel="noreferrer" target="_blank">
              Отвори снимката
            </a>
          </div>
        </div>
      ) : (
        <div
          style={{
            border: '1px dashed var(--theme-elevation-200)',
            borderRadius: '6px',
            color: 'var(--theme-elevation-600)',
            padding: '0.75rem',
          }}
        >
          {label}
        </div>
      )}
    </div>
  )
}
