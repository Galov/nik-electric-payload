'use client'

import { cn } from '@/utilities/cn'
import type { ProductTypeValue } from '@/utilities/microinvest'

type Props = {
  className?: string
  compact?: boolean
  value: ProductTypeValue
}

const CONFIG: Record<
  ProductTypeValue,
  {
    className: string
    label: string
  }
> = {
  compatible: {
    className:
      'border border-[rgb(0,126,229)]/20 bg-[rgb(0,126,229)]/12 text-[rgb(0,126,229)]',
    label: 'Съвместим',
  },
  original: {
    className:
      'border border-[rgb(0,126,229)]/20 bg-[rgb(0,126,229)]/12 text-[rgb(0,126,229)]',
    label: 'Оригинал',
  },
  'removed-from-unit': {
    className: 'border border-emerald-600/20 bg-emerald-50 text-emerald-700',
    label: 'От нов уред',
  },
}

export function ProductTypeBadge({ className, compact = false, value }: Props) {
  const config = CONFIG[value]

  return (
    <span
      className={cn(
        'inline-flex h-8 items-center rounded-md px-2.5 text-[11px] font-medium leading-none uppercase tracking-[0.04em]',
        compact && 'h-6 px-2 text-[10px]',
        config.className,
        className,
      )}
    >
      {config.label}
    </span>
  )
}
