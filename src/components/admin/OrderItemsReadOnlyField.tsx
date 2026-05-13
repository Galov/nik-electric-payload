'use client'

import { useField, useForm, useFormFields } from '@payloadcms/ui'
import { useEffect, useMemo, useState } from 'react'

type OrderItem = {
  id?: string | null
  product?: string | { id?: string | null; title?: string | null } | null
  productMIId?: number | null
  productSKU?: string | null
  productUnitPrice?: number | null
  quantity?: number | null
}

type OrderCorrectionItem = {
  lineKey: string
  productMIId?: number | null
  productSKU?: string | null
  productTitle?: string | null
  productUnitPrice?: number | null
  quantityAfter: number
  quantityBefore: number
}

type OrderCorrection = {
  createdAt: string
  items: OrderCorrectionItem[]
  reason: string
}

type Props = {
  path?: string
}

const getProductLabel = (
  product: OrderItem['product'],
  productTitlesByID: Record<string, string>,
) => {
  if (!product) return '-'
  if (typeof product === 'string') return productTitlesByID[product] || product

  return product.title || product.id || '-'
}

const normalizeItems = (value: unknown): OrderItem[] => {
  if (!Array.isArray(value)) return []

  return value.filter((item): item is OrderItem => Boolean(item && typeof item === 'object'))
}

const normalizeCorrections = (value: unknown): OrderCorrection[] => {
  if (!Array.isArray(value)) return []

  return value.filter(
    (item): item is OrderCorrection =>
      Boolean(item && typeof item === 'object' && Array.isArray((item as OrderCorrection).items)),
  )
}

const formatMoney = (value?: number | null) => {
  if (typeof value !== 'number') return '-'

  return new Intl.NumberFormat('bg-BG', {
    currency: 'EUR',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: 'currency',
  }).format(value)
}

const formatDateTime = (value?: null | string) => {
  if (!value) return '-'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('bg-BG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

const getLineKey = (item: OrderItem, index: number) =>
  item.id || `${item.productMIId ?? 'n/a'}:${item.productSKU ?? 'n/a'}:${index}`

export function OrderItemsReadOnlyField({ path = 'items' }: Props) {
  const { getDataByPath } = useForm()
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false)
  const [correctionReason, setCorrectionReason] = useState('')
  const [draftQuantities, setDraftQuantities] = useState<Record<string, number>>({})

  useFormFields(([fields]) => fields[path])
  const { setValue: setCorrectionsValue, value: correctionsValue } = useField<OrderCorrection[]>({
    path: 'orderCorrections',
  })

  const items = normalizeItems(getDataByPath(path))
  const corrections = normalizeCorrections(correctionsValue)
  const itemsWithKeys = useMemo(
    () =>
      items.map((item, index) => ({
        ...item,
        lineKey: getLineKey(item, index),
      })),
    [items],
  )
  const effectiveQuantityByLineKey = useMemo(() => {
    const quantities = Object.fromEntries(
      itemsWithKeys.map((item) => [item.lineKey, Math.max(0, item.quantity || 0)]),
    ) as Record<string, number>

    for (const correction of corrections) {
      for (const correctionItem of correction.items) {
        quantities[correctionItem.lineKey] = Math.max(0, correctionItem.quantityAfter)
      }
    }

    return quantities
  }, [corrections, itemsWithKeys])
  const productIDs = useMemo(() => {
    const ids = new Set<string>()

    for (const item of itemsWithKeys) {
      if (typeof item.product === 'string') {
        ids.add(item.product)
      }
    }

    return Array.from(ids)
  }, [itemsWithKeys])
  const productIDKey = productIDs.join('\0')
  const [productTitlesByID, setProductTitlesByID] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!productIDKey) return

    let isCancelled = false

    const loadProductTitles = async () => {
      const ids = productIDKey.split('\0').filter(Boolean)
      const entries = await Promise.all(
        ids.map(async (productID): Promise<readonly [string, string] | null> => {
          try {
            const response = await fetch(
              `/api/products/${encodeURIComponent(productID)}?depth=0&select[title]=true`,
              { credentials: 'include' },
            )

            if (!response.ok) return null

            const product = (await response.json()) as { title?: string | null }

            return product.title ? [productID, product.title] : null
          } catch {
            return null
          }
        }),
      )

      const nextTitles = Object.fromEntries(
        entries.filter((entry): entry is readonly [string, string] => Boolean(entry)),
      )

      if (isCancelled || Object.keys(nextTitles).length === 0) return

      setProductTitlesByID((current) => ({
        ...current,
        ...nextTitles,
      }))
    }

    void loadProductTitles()

    return () => {
      isCancelled = true
    }
  }, [productIDKey])

  const openCorrectionModal = () => {
    setDraftQuantities(
      Object.fromEntries(
        itemsWithKeys.map((item) => [item.lineKey, effectiveQuantityByLineKey[item.lineKey] ?? 0]),
      ),
    )
    setCorrectionReason('')
    setIsCorrectionModalOpen(true)
  }

  const changedItems = itemsWithKeys
    .map((item) => {
      const quantityBefore = effectiveQuantityByLineKey[item.lineKey] ?? 0
      const quantityAfter = Math.max(0, Math.min(quantityBefore, draftQuantities[item.lineKey] ?? quantityBefore))

      if (quantityAfter >= quantityBefore) {
        return null
      }

      return {
        lineKey: item.lineKey,
        productMIId: item.productMIId,
        productSKU: item.productSKU,
        productTitle: getProductLabel(item.product, productTitlesByID),
        productUnitPrice: item.productUnitPrice,
        quantityAfter,
        quantityBefore,
      } satisfies OrderCorrectionItem
    })
    .filter(Boolean) as OrderCorrectionItem[]

  const saveCorrectionDraft = () => {
    if (!changedItems.length) {
      setIsCorrectionModalOpen(false)
      return
    }

    const trimmedReason = correctionReason.trim()

    setCorrectionsValue([
      ...corrections,
      {
        createdAt: new Date().toISOString(),
        items: changedItems,
        reason: trimmedReason || 'Ръчна корекция на поръчката',
      },
    ])

    setCorrectionReason('')
    setDraftQuantities({})
    setIsCorrectionModalOpen(false)
  }

  return (
    <div style={{ marginBottom: '2rem' }}>
      <div
        style={{
          alignItems: 'flex-start',
          display: 'flex',
          gap: '1rem',
          justifyContent: 'space-between',
          marginBottom: '0.75rem',
        }}
      >
        <div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 500, margin: 0 }}>Артикули</h3>
          <p style={{ color: 'var(--theme-elevation-600)', margin: '0.25rem 0 0' }}>
            Артикулите са заключени, за да остане поръчката точен запис на заявката на клиента.
          </p>
        </div>
        {itemsWithKeys.length > 0 ? (
          <button
            onClick={openCorrectionModal}
            style={{
              background: 'var(--theme-success-500)',
              border: 'none',
              borderRadius: '6px',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '0.95rem',
              fontWeight: 600,
              padding: '0.7rem 1rem',
              whiteSpace: 'nowrap',
            }}
            type="button"
          >
            Коригирай поръчка
          </button>
        ) : null}
      </div>

      {itemsWithKeys.length > 0 ? (
        <div
          style={{
            border: '1px solid var(--theme-elevation-200)',
            borderRadius: '6px',
            overflow: 'hidden',
          }}
        >
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr style={{ background: 'var(--theme-elevation-50)' }}>
                <th style={{ padding: '0.75rem', textAlign: 'left' }}>Продукт</th>
                <th style={{ padding: '0.75rem', textAlign: 'left', width: '10rem' }}>Microinvest ID</th>
                <th style={{ padding: '0.75rem', textAlign: 'left', width: '14rem' }}>Код</th>
                <th style={{ padding: '0.75rem', textAlign: 'right', width: '8rem' }}>Количество</th>
                <th style={{ padding: '0.75rem', textAlign: 'right', width: '8rem' }}>Ед. цена</th>
                <th style={{ padding: '0.75rem', textAlign: 'right', width: '8rem' }}>Общо</th>
              </tr>
            </thead>
            <tbody>
              {itemsWithKeys.map((item) => {
                const quantity = item.quantity || 0
                const lineTotal =
                  typeof item.productUnitPrice === 'number' ? item.productUnitPrice * quantity : null

                return (
                  <tr key={item.lineKey} style={{ borderTop: '1px solid var(--theme-elevation-150)' }}>
                    <td style={{ padding: '0.75rem' }}>{getProductLabel(item.product, productTitlesByID)}</td>
                    <td style={{ padding: '0.75rem' }}>{item.productMIId ?? '-'}</td>
                    <td style={{ padding: '0.75rem' }}>{item.productSKU || '-'}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>{quantity}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                      {formatMoney(item.productUnitPrice)}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>{formatMoney(lineTotal)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p style={{ color: 'var(--theme-elevation-600)' }}>Няма артикули.</p>
      )}

      {corrections.length > 0 ? (
        <div style={{ marginTop: '2rem' }}>
          <div style={{ marginBottom: '0.75rem' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 500, margin: 0 }}>Корекции</h3>
            <p style={{ color: 'var(--theme-elevation-600)', margin: '0.25rem 0 0' }}>
              Оригиналната поръчка остава непроменена. Тук се пази история на корекциите.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {corrections.map((correction, correctionIndex) => (
              <div
                key={`${correction.createdAt}-${correctionIndex}`}
                style={{
                  border: '1px solid var(--theme-elevation-200)',
                  borderRadius: '6px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    background: 'var(--theme-elevation-50)',
                    borderBottom: '1px solid var(--theme-elevation-150)',
                    padding: '0.75rem 1rem',
                  }}
                >
                  <div style={{ fontWeight: 600 }}>
                    Корекция {correctionIndex + 1} · {formatDateTime(correction.createdAt)}
                  </div>
                  <div style={{ color: 'var(--theme-elevation-700)', marginTop: '0.25rem' }}>
                    {correction.reason || 'Без описание'}
                  </div>
                </div>

                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead>
                    <tr style={{ background: 'var(--theme-elevation-0)' }}>
                      <th style={{ padding: '0.75rem', textAlign: 'left' }}>Продукт</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left', width: '10rem' }}>Microinvest ID</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left', width: '12rem' }}>Код</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right', width: '8rem' }}>Преди</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right', width: '8rem' }}>След</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right', width: '8rem' }}>Разлика</th>
                    </tr>
                  </thead>
                  <tbody>
                    {correction.items.map((item, itemIndex) => (
                      <tr key={`${item.lineKey}-${itemIndex}`} style={{ borderTop: '1px solid var(--theme-elevation-150)' }}>
                        <td style={{ padding: '0.75rem' }}>{item.productTitle || '-'}</td>
                        <td style={{ padding: '0.75rem' }}>{item.productMIId ?? '-'}</td>
                        <td style={{ padding: '0.75rem' }}>{item.productSKU || '-'}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'right' }}>{item.quantityBefore}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'right' }}>{item.quantityAfter}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                          -{Math.max(0, item.quantityBefore - item.quantityAfter)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {isCorrectionModalOpen ? (
        <div
          style={{
            alignItems: 'center',
            background: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            inset: 0,
            justifyContent: 'center',
            padding: '2rem',
            position: 'fixed',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '10px',
              maxHeight: '90vh',
              maxWidth: '980px',
              overflow: 'auto',
              padding: '1.25rem',
              width: '100%',
            }}
          >
            <div style={{ marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 600, margin: 0 }}>Корекция на поръчка</h3>
              <p style={{ color: 'var(--theme-elevation-700)', margin: '0.35rem 0 0' }}>
                Намали количества или занули ред, ако артикулът не може да бъде доставен. Оригиналната
                поръчка няма да бъде променена.
              </p>
            </div>

            <div
              style={{
                border: '1px solid var(--theme-elevation-200)',
                borderRadius: '6px',
                overflow: 'hidden',
              }}
            >
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr style={{ background: 'var(--theme-elevation-50)' }}>
                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>Продукт</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left', width: '10rem' }}>Код</th>
                    <th style={{ padding: '0.75rem', textAlign: 'right', width: '8rem' }}>Налични в поръчката</th>
                    <th style={{ padding: '0.75rem', textAlign: 'right', width: '10rem' }}>Ново количество</th>
                  </tr>
                </thead>
                <tbody>
                  {itemsWithKeys.map((item) => {
                    const quantityBefore = effectiveQuantityByLineKey[item.lineKey] ?? 0

                    return (
                      <tr key={item.lineKey} style={{ borderTop: '1px solid var(--theme-elevation-150)' }}>
                        <td style={{ padding: '0.75rem' }}>{getProductLabel(item.product, productTitlesByID)}</td>
                        <td style={{ padding: '0.75rem' }}>{item.productSKU || '-'}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'right' }}>{quantityBefore}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                          <input
                            max={quantityBefore}
                            min={0}
                            onChange={(event) => {
                              const nextValue = Number(event.target.value)
                              const safeValue = Number.isFinite(nextValue)
                                ? Math.max(0, Math.min(quantityBefore, nextValue))
                                : quantityBefore

                              setDraftQuantities((current) => ({
                                ...current,
                                [item.lineKey]: safeValue,
                              }))
                            }}
                            step={1}
                            style={{
                              border: '1px solid var(--theme-elevation-300)',
                              borderRadius: '6px',
                              padding: '0.45rem 0.6rem',
                              textAlign: 'right',
                              width: '7rem',
                            }}
                            type="number"
                            value={draftQuantities[item.lineKey] ?? quantityBefore}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: '1rem' }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem' }}>
                Причина за корекцията
              </label>
              <textarea
                onChange={(event) => setCorrectionReason(event.target.value)}
                placeholder="Например: Липса на склад за един от артикулите"
                rows={3}
                style={{
                  border: '1px solid var(--theme-elevation-300)',
                  borderRadius: '6px',
                  padding: '0.75rem',
                  resize: 'vertical',
                  width: '100%',
                }}
                value={correctionReason}
              />
            </div>

            <div
              style={{
                display: 'flex',
                gap: '0.75rem',
                justifyContent: 'flex-end',
                marginTop: '1rem',
              }}
            >
              <button
                onClick={() => {
                  setIsCorrectionModalOpen(false)
                  setCorrectionReason('')
                  setDraftQuantities({})
                }}
                style={{
                  background: '#fff',
                  border: '1px solid var(--theme-elevation-300)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  padding: '0.7rem 1rem',
                }}
                type="button"
              >
                Отказ
              </button>
              <button
                disabled={changedItems.length === 0}
                onClick={saveCorrectionDraft}
                style={{
                  background: changedItems.length === 0 ? 'var(--theme-elevation-300)' : 'var(--theme-success-500)',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  cursor: changedItems.length === 0 ? 'not-allowed' : 'pointer',
                  padding: '0.7rem 1rem',
                }}
                type="button"
              >
                Запиши корекция
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
