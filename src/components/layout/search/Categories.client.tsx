'use client'
import React, { useCallback, useMemo, useState } from 'react'

import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import clsx from 'clsx'

type CategoryNode = {
  id: string
  productCount?: number | null
  title: string
  children: CategoryNode[]
}

type ItemProps = {
  category: CategoryNode
  expandedCategoryIDs: Set<string>
  level?: number
  onToggleCategory: (id: string) => void
}

type TreeProps = {
  categories: CategoryNode[]
}

export const CategoryItem: React.FC<ItemProps> = ({
  category,
  expandedCategoryIDs,
  level = 0,
  onToggleCategory,
}) => {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isExpanded = expandedCategoryIDs.has(category.id)

  const isActive = useMemo(() => {
    return searchParams.get('category') === String(category.id)
  }, [category.id, searchParams])

  const setQuery = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString())

    if (isActive) {
      params.delete('category')
    } else {
      params.set('category', String(category.id))
    }

    const newParams = params.toString()

    router.push(pathname + '?' + newParams)
  }, [category.id, isActive, pathname, router, searchParams])

  return (
    <li>
      <div
        className="flex items-start gap-2 py-1"
        style={{ paddingLeft: `${level * 14}px` }}
      >
        {category.children.length > 0 ? (
          <button
            type="button"
            aria-label={isExpanded ? 'Свий категорията' : 'Разгърни категорията'}
            className="mt-0.5 w-5 shrink-0 text-xs text-muted-foreground hover:text-primary"
            onClick={() => onToggleCategory(category.id)}
          >
            {isExpanded ? '−' : '+'}
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}

        <button
          onClick={() => setQuery()}
          className={clsx('block text-left hover:cursor-pointer text-sm', {
            'font-medium underline': isActive,
            'text-primary/80': !isActive,
          })}
        >
          {category.title}
          {typeof category.productCount === 'number' ? (
            <span className="ml-2 text-xs text-muted-foreground">({category.productCount})</span>
          ) : null}
        </button>
      </div>

      {category.children.length > 0 && isExpanded ? (
        <ul className="mt-1">
          {category.children.map((child) => {
            return (
              <CategoryItem
                key={child.id}
                category={child}
                expandedCategoryIDs={expandedCategoryIDs}
                level={level + 1}
                onToggleCategory={onToggleCategory}
              />
            )
          })}
        </ul>
      ) : null}
    </li>
  )
}

export const CategoryTree: React.FC<TreeProps> = ({ categories }) => {
  const [expandedCategoryIDs, setExpandedCategoryIDs] = useState<Set<string>>(new Set())

  const onToggleCategory = useCallback((id: string) => {
    setExpandedCategoryIDs((current) => {
      const next = new Set(current)

      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }

      return next
    })
  }, [])

  return (
    <ul>
      {categories.map((category) => {
        return (
          <CategoryItem
            key={category.id}
            category={category}
            expandedCategoryIDs={expandedCategoryIDs}
            onToggleCategory={onToggleCategory}
          />
        )
      })}
    </ul>
  )
}
