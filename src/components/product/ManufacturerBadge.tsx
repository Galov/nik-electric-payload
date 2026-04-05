'use client'

import { cn } from '@/utilities/cn'

type Props = {
  className?: string
  compact?: boolean
  value: string
}

export function ManufacturerBadge({ className, compact = false, value }: Props) {
  return (
    <span
      className={cn(
        'inline-flex h-8 items-center rounded-md border border-[rgb(0,126,229)]/20 bg-[rgb(0,126,229)]/12 px-2.5 text-[11px] font-medium leading-none uppercase tracking-[0.04em] text-[rgb(0,126,229)]',
        compact && 'h-6 px-2 text-[10px]',
        className,
      )}
    >
      {value}
    </span>
  )
}
