'use client'
import { useMobileCatalogControls } from '@/components/catalog/MobileCatalogControls'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import clsx from 'clsx'
import { ChevronDown, ChevronRight } from 'lucide-react'

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
  isFullTreeVisible: boolean
  onFocusTree: () => void
}

type PanelProps = {
  categories: CategoryNode[]
}

const CategoryChildren: React.FC<{
  childrenNodes: CategoryNode[]
  expandedCategoryIDs: Set<string>
  isExpanded: boolean
  level: number
  onToggleCategory: (id: string) => void
}> = ({ childrenNodes, expandedCategoryIDs, isExpanded, level, onToggleCategory }) => {
  const contentRef = useRef<HTMLUListElement | null>(null)
  const [maxHeight, setMaxHeight] = useState('0px')

  useEffect(() => {
    if (!contentRef.current) return

    const updateHeight = () => {
      if (!contentRef.current) return
      setMaxHeight(isExpanded ? `${contentRef.current.scrollHeight}px` : '0px')
    }

    updateHeight()

    const observer = new ResizeObserver(() => {
      updateHeight()
    })

    observer.observe(contentRef.current)

    return () => {
      observer.disconnect()
    }
  }, [childrenNodes, expandedCategoryIDs, isExpanded])

  return (
    <div
      className={clsx(
        'overflow-hidden transition-[max-height,opacity] duration-500 ease-in-out',
        isExpanded ? 'opacity-100' : 'opacity-0',
      )}
      style={{ maxHeight }}
    >
      <ul className="mt-1" ref={contentRef}>
        {childrenNodes.map((child) => {
          return (
            <CategoryItem
              key={child.id}
              category={child}
              expandedCategoryIDs={expandedCategoryIDs}
              level={level}
              onToggleCategory={onToggleCategory}
            />
          )
        })}
      </ul>
    </div>
  )
}

export const CategoryItem: React.FC<ItemProps> = ({
  category,
  expandedCategoryIDs,
  level = 0,
  onToggleCategory,
}) => {
  const mobileCatalogControls = useMobileCatalogControls()
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
      mobileCatalogControls?.closeCategoryStep()
    } else {
      params.set('category', String(category.id))
      mobileCatalogControls?.openCategoryStep({
        id: category.id,
        title: category.title,
      })
    }

    params.delete('page')

    const newParams = params.toString()

    router.push(pathname + '?' + newParams)
  }, [category.id, category.title, isActive, mobileCatalogControls, pathname, router, searchParams])

  const handleCategoryClick = useCallback(() => {
    if (category.children.length > 0) {
      onToggleCategory(category.id)
    }

    setQuery()
  }, [category.children.length, category.id, onToggleCategory, setQuery])

  return (
    <li>
      <div className="flex items-start gap-2 py-1" style={{ paddingLeft: `${level * 14}px` }}>
        {category.children.length > 0 ? (
          <button
            type="button"
            aria-label={isExpanded ? 'Свий категорията' : 'Разгърни категорията'}
            className="-mt-px flex h-6 w-6 shrink-0 items-center justify-center text-[rgb(0,126,229)]/85 transition-colors hover:text-[rgb(0,113,206)]"
            onClick={() => onToggleCategory(category.id)}
          >
            {isExpanded ? (
              <ChevronDown className="h-[18px] w-[18px]" />
            ) : (
              <ChevronRight className="h-[18px] w-[18px]" />
            )}
          </button>
        ) : (
          <span className="w-6 shrink-0" />
        )}

        <button
          onClick={handleCategoryClick}
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

      {category.children.length > 0 ? (
        <CategoryChildren
          childrenNodes={category.children}
          expandedCategoryIDs={expandedCategoryIDs}
          isExpanded={isExpanded}
          level={level + 1}
          onToggleCategory={onToggleCategory}
        />
      ) : null}
    </li>
  )
}

export const CategoryTree: React.FC<TreeProps> = ({
  categories,
  isFullTreeVisible,
  onFocusTree,
}) => {
  const searchParams = useSearchParams()
  const [expandedCategoryIDs, setExpandedCategoryIDs] = useState<Set<string>>(new Set())

  const selectedCategoryID = searchParams.get('category')

  const selectedPath = useMemo(() => {
    const findPath = (nodes: CategoryNode[], targetID: string): CategoryNode[] | null => {
      for (const node of nodes) {
        if (node.id === targetID) {
          return [node]
        }

        if (node.children.length > 0) {
          const childPath = findPath(node.children, targetID)

          if (childPath) {
            return [node, ...childPath]
          }
        }
      }

      return null
    }

    if (!selectedCategoryID) {
      return []
    }

    return findPath(categories, selectedCategoryID) || []
  }, [categories, selectedCategoryID])

  const visibleCategories = useMemo(() => {
    if (isFullTreeVisible || selectedPath.length < 2) {
      return categories
    }

    const activeRoot = selectedPath[0]
    const selectedParent = selectedPath[selectedPath.length - 2]
    const selectedCategory = selectedPath[selectedPath.length - 1]

    const cloneActiveBranch = (node: CategoryNode, pathIndex: number): CategoryNode => {
      const nextPathNode = selectedPath[pathIndex + 1]

      if (!nextPathNode) {
        return {
          ...node,
          children: node.children,
        }
      }

      if (node.id === selectedParent.id) {
        return {
          ...node,
          children: node.children,
        }
      }

      return {
        ...node,
        children: node.children
          .filter((child) => child.id === nextPathNode.id)
          .map((child) => cloneActiveBranch(child, pathIndex + 1)),
      }
    }

    if (selectedCategory.id === activeRoot.id) {
      return [activeRoot]
    }

    return [cloneActiveBranch(activeRoot, 0)]
  }, [categories, isFullTreeVisible, selectedPath])

  useEffect(() => {
    if (!selectedPath.length) {
      return
    }

    setExpandedCategoryIDs(new Set(selectedPath.map((category) => category.id)))
    onFocusTree()
  }, [selectedPath])

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
      {visibleCategories.map((category) => {
        return (
          <CategoryItem
            key={category.id}
            category={category}
            expandedCategoryIDs={expandedCategoryIDs}
            level={1}
            onToggleCategory={onToggleCategory}
          />
        )
      })}
    </ul>
  )
}

export const CategoriesPanel: React.FC<PanelProps> = ({ categories }) => {
  const mobileCatalogControls = useMobileCatalogControls()
  const contentRef = useRef<HTMLDivElement | null>(null)
  const [isOpen, setIsOpen] = useState(true)
  const [isFullTreeVisible, setIsFullTreeVisible] = useState(false)
  const [maxHeight, setMaxHeight] = useState('none')
  const searchParams = useSearchParams()
  const selectedCategoryID = searchParams.get('category')
  const isFocusedTreeVisible = Boolean(selectedCategoryID && !isFullTreeVisible)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 768px)')

    const syncOpenState = () => {
      setIsOpen(mediaQuery.matches)
    }

    syncOpenState()
    mediaQuery.addEventListener('change', syncOpenState)

    return () => mediaQuery.removeEventListener('change', syncOpenState)
  }, [])

  useEffect(() => {
    mobileCatalogControls?.setCategoryListExpanded(isOpen)

    return () => {
      mobileCatalogControls?.setCategoryListExpanded(false)
    }
  }, [isOpen, mobileCatalogControls])

  useEffect(() => {
    if (!contentRef.current) return

    const updateHeight = () => {
      setMaxHeight(isOpen ? `${contentRef.current?.scrollHeight || 0}px` : '0px')
    }

    updateHeight()

    const observer = new ResizeObserver(() => {
      updateHeight()
    })

    observer.observe(contentRef.current)

    return () => {
      observer.disconnect()
    }
  }, [categories, isOpen])

  return (
    <section className="rounded-[6px] bg-[rgb(250,251,253)] px-5 py-5 md:px-6">
      <button
        type="button"
        aria-expanded={isFocusedTreeVisible ? false : isOpen}
        className="flex w-full items-center gap-2 text-left"
        onClick={() => {
          if (isFocusedTreeVisible) {
            setIsFullTreeVisible(true)
            setIsOpen(true)
            return
          }

          setIsOpen((current) => !current)
        }}
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center">
          <ChevronDown
            className={clsx(
              'h-[18px] w-[18px] text-[rgb(0,126,229)] transition-transform duration-500 ease-in-out',
              {
                'rotate-180': isOpen && !isFocusedTreeVisible,
              },
            )}
          />
        </span>

        <div className="flex items-center">
          <h3 className="text-sm font-normal tracking-[0.04em] text-[rgb(0,126,229)]">Категории</h3>
        </div>
      </button>

      <div
        className={clsx(
          'overflow-hidden transition-[max-height,opacity,margin-top] duration-500 ease-in-out',
          isOpen ? 'mt-4 opacity-100' : 'mt-0 opacity-0',
        )}
        style={{ maxHeight }}
      >
        <div ref={contentRef}>
          <CategoryTree
            categories={categories}
            isFullTreeVisible={isFullTreeVisible}
            onFocusTree={() => setIsFullTreeVisible(false)}
          />
        </div>
      </div>
    </section>
  )
}
