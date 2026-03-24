import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
} from '@/components/ui/pagination'
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

  return (
    <Pagination className="mt-10 justify-center">
      <PaginationContent>
        <PaginationItem>
          <PaginationLink
            className={currentPage <= 1 ? 'pointer-events-none opacity-40' : undefined}
            href={getPageHref(searchParams, currentPage - 1)}
            size="default"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Назад</span>
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
                <PaginationLink href={getPageHref(searchParams, page)} isActive={page === currentPage}>
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
            <span>Напред</span>
            <ChevronRight className="h-4 w-4" />
          </PaginationLink>
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}
