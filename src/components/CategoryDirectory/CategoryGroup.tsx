'use client'

import { ChevronDown } from 'lucide-react'
import Link from 'next/link'
import { useState, type ReactNode } from 'react'

import { cn } from '@/utilities/cn'

type Props = {
  children?: ReactNode
  count: ReactNode
  href: string
  id: string
  title: string
}

export function CategoryGroup({ children, count, href, id, title }: Props) {
  const [expanded, setExpanded] = useState(false)
  const headingID = `category-${id}`
  const contentID = `${headingID}-children`
  const headingClass =
    'min-h-12 items-center justify-between gap-3 border-b border-[rgb(0,126,229)]/15 text-lg font-medium text-[rgb(0,113,206)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(0,126,229)]'

  return (
    <section aria-labelledby={headingID} className="mb-2 break-inside-avoid md:mb-8">
      <h2 id={headingID}>
        {children && (
          <button
            aria-controls={contentID}
            aria-expanded={expanded}
            className={cn(headingClass, 'flex w-full py-3 text-left md:hidden')}
            onClick={() => setExpanded((value) => !value)}
            type="button"
          >
            <span className="flex-1">{title}</span>
            {count}
            <ChevronDown
              aria-hidden="true"
              className={cn(
                'h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none',
                expanded && 'rotate-180',
              )}
            />
          </button>
        )}
        <Link
          className={cn(
            headingClass,
            'mb-2 py-3 hover:underline md:pt-0',
            children ? 'hidden md:flex' : 'flex',
          )}
          href={href}
          prefetch={false}
        >
          <span>{title}</span>
          {count}
        </Link>
      </h2>
      {children && (
        <div className={cn('pb-4 md:pb-0', expanded ? 'block' : 'hidden md:block')} id={contentID}>
          <Link
            className="flex min-h-11 items-center py-3 text-sm font-medium text-[rgb(0,113,206)] hover:underline md:hidden"
            href={href}
            prefetch={false}
          >
            Всички продукти в „{title}“
          </Link>
          {children}
        </div>
      )}
    </section>
  )
}
