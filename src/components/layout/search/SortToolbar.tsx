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
    <div className="flex flex-col gap-4 pt-0 sm:flex-row sm:items-center sm:justify-between sm:pt-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="flex flex-col gap-2 text-[13px] text-primary/60 sm:flex-row sm:items-center sm:gap-3">
          <span className="font-medium text-primary/70 sm:font-normal sm:text-primary/60">
            Продукти на страница
          </span>
          <select
            className="h-11 w-full rounded-md border bg-white px-4 text-[16px] text-primary/80 outline-none transition focus:border-[rgb(0,126,229)] sm:h-10 sm:w-auto sm:min-w-[92px] sm:rounded-xl sm:text-[13px]"
            onChange={onPageSizeChange}
            value={String(pageSize)}
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-2 text-[13px] text-primary/60 sm:ml-auto sm:flex-row sm:items-center sm:gap-3">
        <span className="inline-flex items-center gap-2 font-medium text-primary/70 sm:font-normal sm:text-primary/60">
          <ArrowUpDown className="h-4 w-4" />
          Сортиране
        </span>
        <select
          className="h-11 w-full rounded-md border bg-white px-4 text-[16px] text-primary/80 outline-none transition focus:border-[rgb(0,126,229)] sm:h-10 sm:w-auto sm:min-w-[220px] sm:rounded-xl sm:text-[13px]"
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
