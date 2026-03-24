'use client'

import { cn } from '@/utilities/cn'

type Props = {
  className?: string
  compact?: boolean
}

export function RefurbishedBadge({ className, compact = false }: Props) {
  return (
    <span
      className={cn(
        'inline-flex h-8 items-center rounded-md border border-emerald-600/20 bg-emerald-50 px-2.5 text-[11px] font-medium leading-none uppercase tracking-[0.04em] text-emerald-700',
        compact && 'h-6 px-2 text-[10px]',
        className,
      )}
    >
      От нов уред
    </span>
  )
}
