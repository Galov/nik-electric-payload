import configPromise from '@payload-config'
import { ArrowUpRight, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { getPayload } from 'payload'

import { CategoryGroup } from '@/components/CategoryDirectory/CategoryGroup'
import type { Category } from '@/payload-types'
import { generateMeta } from '@/utilities/generateMeta'

type CategoryNode = Pick<Category, 'id' | 'title' | 'productCount'> & {
  children: CategoryNode[]
}

const categoryHref = (id: string) => `/shop?category=${encodeURIComponent(id)}#catalog`

function ProductCount({ count }: { count: Category['productCount'] }) {
  if (typeof count !== 'number') return null

  return (
    <span className="shrink-0 text-sm font-normal tabular-nums text-primary/45">
      <span className="sr-only">Брой продукти: </span>
      {count.toLocaleString('bg-BG')}
    </span>
  )
}

function Subcategories({ categories }: { categories: CategoryNode[] }) {
  return (
    <ul className="ml-1 border-l border-[rgb(0,126,229)]/15 pl-4">
      {categories.map((category) => (
        <li key={category.id}>
          <Link
            className="flex min-h-11 items-center justify-between gap-3 rounded-sm py-2 text-sm leading-6 text-primary/75 transition-colors hover:text-[rgb(0,126,229)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(0,126,229)]"
            href={categoryHref(category.id)}
            prefetch={false}
          >
            <span>{category.title}</span>
            <ProductCount count={category.productCount} />
          </Link>
          {category.children.length > 0 && <Subcategories categories={category.children} />}
        </li>
      ))}
    </ul>
  )
}

export default async function CategoriesPage() {
  const payload = await getPayload({ config: configPromise })
  const { docs } = await payload.find({
    collection: 'categories',
    depth: 0,
    overrideAccess: false,
    pagination: false,
    select: { parent: true, productCount: true, title: true },
    sort: 'title',
  })

  const nodes = new Map<string, CategoryNode>(
    docs.map((category) => [category.id, { ...category, children: [] }]),
  )
  const roots: CategoryNode[] = []

  for (const category of docs) {
    const node = nodes.get(category.id)!
    const parentID = typeof category.parent === 'string' ? category.parent : category.parent?.id
    const parent = parentID ? nodes.get(parentID) : undefined

    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  const sortCategories = (categories: CategoryNode[]) => {
    categories.sort((a, b) => a.title.localeCompare(b.title, 'bg'))
    categories.forEach((category) => sortCategories(category.children))
  }
  sortCategories(roots)

  return (
    <div className="container py-8 md:py-12">
      <nav aria-label="Път до страницата" className="mb-8 text-sm text-primary/55">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link className="hover:text-[rgb(0,126,229)]" href="/">
              Начало
            </Link>
          </li>
          <li aria-hidden="true">
            <ChevronRight className="h-3.5 w-3.5" />
          </li>
          <li aria-current="page">Категории</li>
        </ol>
      </nav>

      <div className="mb-10 flex flex-col gap-5 border-b border-[rgb(0,126,229)]/15 pb-8 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-normal text-primary/85 md:text-4xl">Продуктови категории</h1>
          <p className="mt-4 text-base leading-7 text-primary/65">
            Намерете нужната част по категория. Разгледайте всички продуктови групи и подкатегории в
            каталога на Ник Електрик.
          </p>
        </div>
        <Link
          className="inline-flex min-h-11 shrink-0 items-center gap-2 text-sm text-[rgb(0,126,229)] hover:underline"
          href="/shop"
        >
          Всички продукти <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      </div>

      {roots.length > 0 ? (
        <div className="columns-1 gap-10 md:columns-2 xl:columns-3">
          {roots.map((category) => (
            <CategoryGroup
              count={<ProductCount count={category.productCount} />}
              href={categoryHref(category.id)}
              id={category.id}
              key={category.id}
              title={category.title}
            >
              {category.children.length > 0 && <Subcategories categories={category.children} />}
            </CategoryGroup>
          ))}
        </div>
      ) : (
        <p className="py-8 text-primary/65">В момента няма добавени продуктови категории.</p>
      )}
    </div>
  )
}

export async function generateMetadata() {
  return generateMeta({
    doc: { title: 'Продуктови категории' },
    fallbackDescription:
      'Разгледайте всички категории и подкатегории за резервни части и електроматериали в каталога на Ник Електрик.',
    fallbackTitle: 'Продуктови категории',
    path: '/kategorii',
  })
}
