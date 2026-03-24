'use client'

import { sorting } from '@/lib/constants'
import { createUrl } from '@/utilities/createUrl'
import { ArrowUpDown } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import React from 'react'

type Props = {
  pageSize: number
}

const pageSizeOptions = [8, 16, 24, 48, 96] as const

export const SortToolbar: React.FC<Props> = ({ pageSize }) => {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentSort = searchParams.get('sort') || ''

  const onSortChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextParams = new URLSearchParams(searchParams.toString())
    const nextSort = event.target.value

    nextParams.delete('page')

    if (nextSort) {
      nextParams.set('sort', nextSort)
    } else {
      nextParams.delete('sort')
    }

    router.push(createUrl(pathname, nextParams))
  }

  const onPageSizeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextParams = new URLSearchParams(searchParams.toString())
    const nextPageSize = event.target.value

    nextParams.delete('page')

    if (nextPageSize) {
      nextParams.set('limit', nextPageSize)
    } else {
      nextParams.delete('limit')
    }

    router.push(createUrl(pathname, nextParams))
  }

  return (
    <div className="flex flex-col gap-4 pt-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="flex items-center gap-3 text-[13px] text-primary/60">
          <span>Покажи</span>
          <select
            className="h-10 min-w-[92px] rounded-xl border bg-white px-4 text-[13px] text-primary/80 outline-none transition focus:border-[rgb(0,126,229)]"
            onChange={onPageSizeChange}
            value={String(pageSize)}
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <span>продукта на страница</span>
        </label>
      </div>

      <label className="flex items-center gap-3 text-[13px] text-primary/60 sm:ml-auto">
        <span className="inline-flex items-center gap-2">
          <ArrowUpDown className="h-4 w-4" />
          Сортиране
        </span>
        <select
          className="h-10 min-w-[220px] rounded-xl border bg-white px-4 text-[13px] text-primary/80 outline-none transition focus:border-[rgb(0,126,229)]"
          onChange={onSortChange}
          value={currentSort}
        >
          {sorting.map((item) => (
            <option key={item.title} value={item.slug || ''}>
              {item.title}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
