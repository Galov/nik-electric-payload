import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
} from '@/components/ui/pagination'
import { Button } from '@/components/ui/button'
import { createUrl } from '@/utilities/createUrl'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import React from 'react'

type Props = {
  currentPage: number
  totalPages: number
  searchParams: URLSearchParams
}

const buildPageNumbers = (currentPage: number, totalPages: number) => {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  const pages = new Set<number>([1, totalPages, currentPage, currentPage - 1, currentPage + 1])

  if (currentPage <= 3) {
    pages.add(2)
    pages.add(3)
    pages.add(4)
  }

  if (currentPage >= totalPages - 2) {
    pages.add(totalPages - 1)
    pages.add(totalPages - 2)
    pages.add(totalPages - 3)
  }

  return [...pages].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b)
}

const getPageHref = (searchParams: URLSearchParams, page: number) => {
  const nextParams = new URLSearchParams(searchParams.toString())

  if (page <= 1) {
    nextParams.delete('page')
  } else {
    nextParams.set('page', String(page))
  }

  return createUrl('/shop', nextParams)
}

export const CatalogPagination: React.FC<Props> = ({ currentPage, totalPages, searchParams }) => {
  if (totalPages <= 1) return null

  const pages = buildPageNumbers(currentPage, totalPages)
  const preservedSearchParams = [...searchParams.entries()].filter(([key]) => key !== 'page')

  return (
    <div className="mt-10 flex flex-col items-center gap-4">
      <Pagination>
        <PaginationContent className="flex-wrap justify-center">
          <PaginationItem>
            <PaginationLink
              className={currentPage <= 1 ? 'pointer-events-none opacity-40' : undefined}
              href={getPageHref(searchParams, currentPage - 1)}
              size="default"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Назад</span>
            </PaginationLink>
          </PaginationItem>

          {pages.map((page, index) => {
            const previousPage = pages[index - 1]
            const showEllipsis = previousPage && page - previousPage > 1

            return (
              <React.Fragment key={page}>
                {showEllipsis ? (
                  <PaginationItem>
                    <PaginationEllipsis />
                  </PaginationItem>
                ) : null}

                <PaginationItem>
                  <PaginationLink
                    href={getPageHref(searchParams, page)}
                    isActive={page === currentPage}
                  >
                    {page}
                  </PaginationLink>
                </PaginationItem>
              </React.Fragment>
            )
          })}

          <PaginationItem>
            <PaginationLink
              className={currentPage >= totalPages ? 'pointer-events-none opacity-40' : undefined}
              href={getPageHref(searchParams, currentPage + 1)}
              size="default"
            >
              <span className="hidden sm:inline">Напред</span>
              <ChevronRight className="h-4 w-4" />
            </PaginationLink>
          </PaginationItem>
        </PaginationContent>
      </Pagination>

      <form
        action="/shop"
        className="flex flex-wrap items-center justify-center gap-2 text-xs uppercase tracking-widest text-primary/50"
        method="get"
      >
        {preservedSearchParams.map(([key, value], index) => (
          <input key={`${key}-${index}`} name={key} type="hidden" value={value} />
        ))}

        <label htmlFor="catalog-page">Отиди на страница</label>
        <input
          className="h-9 w-20 rounded-md border border-input bg-card px-3 text-center text-xs tracking-widest text-primary outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          defaultValue={currentPage}
          id="catalog-page"
          max={totalPages}
          min={1}
          name="page"
          required
          type="number"
        />
        <span>от {totalPages}</span>
        <Button
          className="bg-[rgb(0,126,229)] text-xs uppercase tracking-widest text-white hover:bg-[rgb(0,107,195)]"
          size="sm"
          type="submit"
        >
          Отиди
        </Button>
      </form>
    </div>
  )
}
