'use client'

import type { DefaultCellComponentProps } from 'payload'
import { useState } from 'react'

const statusOptions = [
  { label: 'Обработва се', value: 'processing' },
  { label: 'Задържана', value: 'held' },
  { label: 'Приключена', value: 'completed' },
  { label: 'Отказана', value: 'cancelled' },
  { label: 'Възстановена', value: 'refunded' },
] as const

type OrderStatus = (typeof statusOptions)[number]['value']

const isOrderStatus = (value: unknown): value is OrderStatus =>
  statusOptions.some((option) => option.value === value)

export function OrderStatusCell({ cellData, rowData }: DefaultCellComponentProps) {
  const initialStatus = isOrderStatus(cellData) ? cellData : 'processing'
  const [status, setStatus] = useState<OrderStatus>(initialStatus)
  const [isSaving, setIsSaving] = useState(false)

  return (
    <select
      aria-label="Статус на поръчката"
      disabled={isSaving}
      onClick={(event) => event.stopPropagation()}
      onChange={async (event) => {
        event.stopPropagation()
        const nextStatus = event.target.value

        if (!isOrderStatus(nextStatus) || nextStatus === status) return

        const previousStatus = status
        setStatus(nextStatus)
        setIsSaving(true)

        try {
          const response = await fetch(
            `/api/orders/${encodeURIComponent(String(rowData.id))}/status`,
            {
              body: JSON.stringify({ status: nextStatus }),
              credentials: 'same-origin',
              headers: {
                'Content-Type': 'application/json',
              },
              method: 'PATCH',
            },
          )

          if (!response.ok) {
            const result = (await response.json().catch(() => null)) as { message?: string } | null
            throw new Error(result?.message || 'Статусът не беше записан.')
          }
        } catch (error) {
          setStatus(previousStatus)
          window.alert(error instanceof Error ? error.message : 'Статусът не беше записан.')
        } finally {
          setIsSaving(false)
        }
      }}
      onKeyDown={(event) => event.stopPropagation()}
      value={status}
      style={{
        background: 'var(--theme-elevation-50)',
        border: '1px solid var(--theme-elevation-250)',
        borderRadius: '3px',
        color: 'var(--theme-text)',
        cursor: isSaving ? 'wait' : 'pointer',
        minWidth: '138px',
        padding: '6px 28px 6px 8px',
      }}
    >
      {statusOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
