'use client'

import { useField } from '@payloadcms/ui'
import { Check, ChevronRight, Search, X } from 'lucide-react'
import React, { useCallback, useEffect, useMemo, useState } from 'react'

import './CategoryColumnsField.scss'

type CategoryValue =
  | string
  | number
  | { id?: string | number; value?: string | number }
  | null

type Category = {
  id: string
  title: string
  parentID: string | null
  children: Category[]
}

type CategoryDocument = {
  id: string | number
  title?: string | null
  parent?: CategoryValue
}

const getID = (value: CategoryValue): string | null => {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (!value || typeof value !== 'object') return null
  const id = value.id ?? value.value
  return id === undefined || id === null ? null : String(id)
}

const getParentID = (value: CategoryValue): string | null => getID(value)

const buildTree = (documents: CategoryDocument[]) => {
  const nodes = new Map<string, Category>()

  for (const document of documents) {
    nodes.set(String(document.id), {
      id: String(document.id),
      title: document.title || 'Категория без име',
      parentID: getParentID(document.parent ?? null),
      children: [],
    })
  }

  const roots: Category[] = []
  for (const node of nodes.values()) {
    const parent = node.parentID ? nodes.get(node.parentID) : null
    if (parent && parent.id !== node.id) parent.children.push(node)
    else roots.push(node)
  }

  return roots
}

const flattenTree = (categories: Category[]): Category[] =>
  categories.flatMap((category) => [category, ...flattenTree(category.children)])

const getAncestors = (categoryID: string, byID: Map<string, Category>) => {
  const ancestors: string[] = []
  let category = byID.get(categoryID)
  const visited = new Set<string>([categoryID])

  while (category?.parentID) {
    if (visited.has(category.parentID)) break
    visited.add(category.parentID)
    ancestors.unshift(category.parentID)
    category = byID.get(category.parentID)
  }

  return ancestors
}

const getDescendantIDs = (category: Category): string[] =>
  category.children.flatMap((child) => [child.id, ...getDescendantIDs(child)])

export const CategoryColumnsField = () => {
  const { value, setValue, disabled } = useField<CategoryValue[]>()
  const [categories, setCategories] = useState<Category[]>([])
  const [openPath, setOpenPath] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let isActive = true

    const loadCategories = async () => {
      try {
        const documents: CategoryDocument[] = []
        let page = 1
        let hasNextPage = true

        while (hasNextPage) {
          const params = new URLSearchParams({
            depth: '0',
            limit: '500',
            page: String(page),
            sort: 'adminSort',
          })
          const response = await fetch(`/api/categories?${params.toString()}`, {
            credentials: 'same-origin',
          })
          if (!response.ok) throw new Error('Категориите не могат да бъдат заредени.')

          const result = (await response.json()) as {
            docs?: CategoryDocument[]
            hasNextPage?: boolean
            nextPage?: number | null
          }
          documents.push(...(result.docs || []))
          hasNextPage = Boolean(result.hasNextPage && result.nextPage)
          page = result.nextPage || page + 1
        }

        if (isActive) setCategories(buildTree(documents))
      } catch (error) {
        if (isActive) {
          setLoadError(error instanceof Error ? error.message : 'Грешка при зареждане на категориите.')
        }
      } finally {
        if (isActive) setLoading(false)
      }
    }

    void loadCategories()
    return () => {
      isActive = false
    }
  }, [])

  const flatCategories = useMemo(() => flattenTree(categories), [categories])
  const byID = useMemo(() => new Map(flatCategories.map((category) => [category.id, category])), [flatCategories])
  const selectedIDs = useMemo(
    () => (Array.isArray(value) ? value.map(getID).filter((id): id is string => Boolean(id)) : []),
    [value],
  )
  const selectedSet = useMemo(() => new Set(selectedIDs), [selectedIDs])
  const columns = useMemo(() => {
    const result: Array<{ parentID: string | null; title: string; categories: Category[] }> = [
      { parentID: null, title: 'Главни категории', categories },
    ]

    for (const categoryID of openPath) {
      const parent = byID.get(categoryID)
      if (!parent?.children.length) break
      result.push({ parentID: parent.id, title: parent.title, categories: parent.children })
    }

    return result
  }, [byID, categories, openPath])

  const searchResults = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('bg-BG')
    if (!query) return []

    return flatCategories
      .filter((category) => category.title.toLocaleLowerCase('bg-BG').includes(query))
      .slice(0, 12)
  }, [flatCategories, search])

  const toggleCategory = useCallback(
    (categoryID: string) => {
      const next = new Set(selectedSet)
      if (next.has(categoryID)) {
        const category = byID.get(categoryID)
        next.delete(categoryID)
        if (category) getDescendantIDs(category).forEach((id) => next.delete(id))
      } else {
        next.add(categoryID)
        getAncestors(categoryID, byID).forEach((id) => next.add(id))
      }

      setValue([...next])
    },
    [byID, selectedSet, setValue],
  )

  const openCategory = useCallback((categoryID: string, columnIndex: number) => {
    setOpenPath((current) => [...current.slice(0, columnIndex), categoryID])
  }, [])

  const revealCategory = useCallback(
    (categoryID: string) => {
      setOpenPath(getAncestors(categoryID, byID))
      setSearch('')
    },
    [byID],
  )

  const removeCategory = useCallback(
    (categoryID: string) => {
      const category = byID.get(categoryID)
      const remove = new Set([categoryID, ...(category ? getDescendantIDs(category) : [])])
      setValue(selectedIDs.filter((id) => !remove.has(id)))
    },
    [byID, selectedIDs, setValue],
  )

  const selectedCategories = selectedIDs.map((id) => byID.get(id)).filter((category) => category)

  return (
    <div className="category-columns-field">
      <div className="category-columns-field__top">
        <label className="category-columns-field__label" htmlFor="category-columns-search">
          Категории
        </label>
        <div className="category-columns-field__search-wrap">
          <Search aria-hidden="true" size={16} />
          <input
            id="category-columns-search"
            type="search"
            value={search}
            disabled={disabled || loading}
            placeholder="Търси категория..."
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      {selectedCategories.length > 0 && (
        <div className="category-columns-field__selected" aria-label="Избрани категории">
          {selectedCategories.map((category) => (
            <span className="category-columns-field__chip" key={category!.id}>
              {category!.title}
              {!disabled && (
                <button
                  type="button"
                  aria-label={`Премахни категория ${category!.title} и нейните подкатегории`}
                  onClick={() => removeCategory(category!.id)}
                >
                  <X aria-hidden="true" size={13} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {loadError ? (
        <p className="category-columns-field__message category-columns-field__message--error">
          {loadError}
        </p>
      ) : loading ? (
        <p className="category-columns-field__message">Зареждам категориите…</p>
      ) : search.trim() ? (
        <div className="category-columns-field__results">
          {searchResults.length ? (
            searchResults.map((category) => (
              <button
                type="button"
                className="category-columns-field__search-result"
                key={category.id}
                onClick={() => {
                  toggleCategory(category.id)
                  revealCategory(category.id)
                }}
              >
                <span>{category.title}</span>
                <small>
                  {[...getAncestors(category.id, byID), category.id]
                    .map((id) => byID.get(id)?.title)
                    .filter(Boolean)
                    .join(' / ')}
                </small>
                {selectedSet.has(category.id) ? <Check size={16} /> : <span>Добави</span>}
              </button>
            ))
          ) : (
            <p className="category-columns-field__message">Няма намерени категории.</p>
          )}
        </div>
      ) : categories.length ? (
        <div className="category-columns-field__columns" aria-label="Йерархия на категориите">
          {columns.map((column, columnIndex) => (
            <div className="category-columns-field__column" key={column.parentID || 'root'}>
              <div className="category-columns-field__column-title">{column.title}</div>
              <ul>
                {column.categories.map((category) => {
                  const hasChildren = category.children.length > 0
                  const isOpen = openPath[columnIndex] === category.id
                  const isSelected = selectedSet.has(category.id)

                  return (
                    <li className={isOpen ? 'is-open' : ''} key={category.id}>
                      <label className="category-columns-field__row">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={disabled}
                          onChange={() => toggleCategory(category.id)}
                        />
                        <span>{category.title}</span>
                      </label>
                      {hasChildren && (
                        <button
                          type="button"
                          className="category-columns-field__open"
                          aria-label={`Отвори подкатегориите на ${category.title}`}
                          aria-pressed={isOpen}
                          onClick={() => openCategory(category.id, columnIndex)}
                        >
                          <ChevronRight aria-hidden="true" size={16} />
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p className="category-columns-field__message">Все още няма създадени категории.</p>
      )}

      <p className="category-columns-field__hint">
        Отметнете категорията, за да я добавите. Отворете стрелката, за да видите подкатегориите.
        При избор на подкатегория родителите се добавят автоматично.
      </p>
    </div>
  )
}
