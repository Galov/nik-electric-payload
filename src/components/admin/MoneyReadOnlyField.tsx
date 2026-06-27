'use client'

import { useField, useFormFields } from '@payloadcms/ui'
import { fromMinorUnits } from '@/utilities/money'

type Props = {
  path: string
}

const formatMoney = (value?: number | null) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return ''

  return new Intl.NumberFormat('bg-BG', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: 'decimal',
  }).format(value)
}

export function MoneyReadOnlyField({ path }: Props) {
  useFormFields(([fields]) => fields[path])

  const { value } = useField<number | null>({
    path,
  })

  const formattedValue = typeof value === 'number' ? formatMoney(fromMinorUnits(value)) : ''

  return (
    <div
      style={{
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: '6px',
        color: 'var(--theme-text)',
        display: 'block',
        fontSize: '1rem',
        lineHeight: 1.5,
        minHeight: '48px',
        padding: '12px 14px',
        textAlign: 'left',
        width: '100%',
      }}
    >
      {formattedValue || '-'}
    </div>
  )
}
