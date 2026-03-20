'use client'

import { Button } from '@/components/ui/button'
import { cn } from '@/utilities/cn'
import { createUrl } from '@/utilities/createUrl'
import { SearchIcon } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import React, { useEffect, useMemo, useState } from 'react'

type BrandOption = {
  id: string
  title: string
}

type Props = {
  className?: string
}

export const Search: React.FC<Props> = ({ className }) => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [brands, setBrands] = useState<BrandOption[]>([])
  const [selectedBrandTitle, setSelectedBrandTitle] = useState('')
  const [selectedCategoryTitle, setSelectedCategoryTitle] = useState<string | null>(null)
  const selectedCategoryID = searchParams?.get('category')
  const selectedBrandID = searchParams?.get('brand')

  useEffect(() => {
    let isMounted = true

    const loadBrands = async () => {
      try {
        const response = await fetch('/api/brands?limit=1000&sort=title')

        if (!response.ok) {
          throw new Error('Failed to load brands.')
        }

        const result = await response.json()

        if (!isMounted) return

        const nextBrands: BrandOption[] = (result?.docs || []).map(
          (brand: { id: string; title: string }) => ({
            id: String(brand.id),
            title: brand.title,
          }),
        )

        setBrands(nextBrands)

        if (selectedBrandID) {
          const selectedBrand = nextBrands.find((brand) => brand.id === selectedBrandID)
          setSelectedBrandTitle(selectedBrand?.title || '')
        } else {
          setSelectedBrandTitle('')
        }
      } catch {
        if (isMounted) {
          setBrands([])
        }
      }
    }

    void loadBrands()

    if (!selectedCategoryID) {
      setSelectedCategoryTitle(null)
    } else {
      const loadCategoryTitle = async () => {
        try {
          const response = await fetch(`/api/categories/${selectedCategoryID}`)

          if (!response.ok) {
            throw new Error('Failed to load category title.')
          }

          const category = await response.json()

          if (isMounted) {
            setSelectedCategoryTitle(category?.title || null)
          }
        } catch {
          if (isMounted) {
            setSelectedCategoryTitle(null)
          }
        }
      }

      void loadCategoryTitle()
    }

    return () => {
      isMounted = false
    }
  }, [selectedBrandID, selectedCategoryID])

  const placeholder = useMemo(() => {
    if (selectedCategoryTitle) {
      return `Търси по име, марка, категория, производител, номер в ${selectedCategoryTitle}`
    }

    return 'Търси по име, марка, категория, производител, номер във всички продукти'
  }, [selectedCategoryTitle])
  const hasActiveFilters = useMemo(() => {
    return Boolean(
      searchParams?.get('q') ||
        searchParams?.get('brand') ||
        searchParams?.get('category') ||
        searchParams?.get('sort'),
    )
  }, [searchParams])

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    const val = e.target as HTMLFormElement
    const search = val.searchQuery as HTMLInputElement
    const brand = val.brandQuery as HTMLInputElement
    const newParams = new URLSearchParams(searchParams.toString())

    if (search.value) {
      newParams.set('q', search.value)
    } else {
      newParams.delete('q')
      newParams.delete('name')
      newParams.delete('sku')
    }

    const matchedBrand = brands.find(
      (brandOption) => brandOption.title.toLowerCase() === brand.value.trim().toLowerCase(),
    )

    if (matchedBrand) {
      newParams.set('brand', matchedBrand.id)
    } else if (!brand.value.trim()) {
      newParams.delete('brand')
    }

    router.push(createUrl('/shop', newParams))
  }

  function onResetFilters() {
    router.push('/shop')
  }

  return (
    <form
      className={cn(
        'grid w-full items-stretch gap-3 md:grid-cols-[minmax(0,1.8fr)_minmax(240px,0.7fr)_auto_auto]',
        className,
      )}
      onSubmit={onSubmit}
    >
      <div className="relative">
        <input
          autoComplete="off"
          className="h-12 w-full rounded-xl border bg-white px-5 pr-12 text-sm text-black placeholder:text-neutral-500 dark:border-neutral-800 dark:bg-black dark:text-white dark:placeholder:text-neutral-400"
          defaultValue={searchParams?.get('q') || ''}
          key={searchParams?.get('q') || ''}
          name="searchQuery"
          placeholder={placeholder}
          type="text"
        />
        <div className="absolute right-0 top-0 mr-3 flex h-full items-center">
          <SearchIcon className="h-4" />
        </div>
      </div>
      <input
        autoComplete="off"
        className="h-12 w-full rounded-xl border bg-white px-4 text-sm text-black placeholder:text-neutral-500 dark:border-neutral-800 dark:bg-black dark:text-white dark:placeholder:text-neutral-400"
        list="brand-options"
        name="brandQuery"
        onChange={(event) => setSelectedBrandTitle(event.target.value)}
        placeholder="Избери марка..."
        type="text"
        value={selectedBrandTitle}
      />
      <datalist id="brand-options">
        {brands.map((brand) => (
          <option key={brand.id} value={brand.title} />
        ))}
      </datalist>
      <Button
        className="h-12 rounded-xl bg-[rgb(0,126,229)] px-9 text-sm font-normal text-white hover:bg-[rgb(0,113,206)]"
        type="submit"
      >
        Търси
      </Button>
      {hasActiveFilters ? (
        <Button
          className="h-12 rounded-xl px-5 text-sm font-normal"
          onClick={onResetFilters}
          type="button"
          variant="outline"
        >
          Изчисти филтрите
        </Button>
      ) : null}
    </form>
  )
}
