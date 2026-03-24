import configPromise from '@payload-config'
import { getPayload } from 'payload'
import clsx from 'clsx'
import React, { Suspense } from 'react'

import { CategoriesPanel } from './Categories.client'

type CategoryNode = {
  id: string
  productCount?: number | null
  productIDs: Set<string>
  title: string
  children: CategoryNode[]
}

async function CategoryList() {
  const payload = await getPayload({ config: configPromise })

  const categories = await payload.find({
    collection: 'categories',
    depth: 0,
    limit: 1000,
    pagination: false,
    select: {
      parent: true,
      productCount: true,
      title: true,
    },
    sort: 'title',
  })

  const nodes = new Map<string, CategoryNode>()
  const rootNodes: CategoryNode[] = []

  for (const category of categories.docs) {
    nodes.set(category.id, {
      children: [],
      id: category.id,
      productCount: category.productCount,
      productIDs: new Set<string>(),
      title: category.title,
    })
  }

  for (const category of categories.docs) {
    const node = nodes.get(category.id)

    if (!node) continue

    const parentID = typeof category.parent === 'string' ? category.parent : null

    if (!parentID) {
      rootNodes.push(node)
      continue
    }

    const parentNode = nodes.get(parentID)

    if (!parentNode) {
      rootNodes.push(node)
      continue
    }

    parentNode.children.push(node)
  }

  const sortTree = (treeNodes: CategoryNode[]) => {
    treeNodes.sort((a, b) => a.title.localeCompare(b.title, 'bg'))
    for (const node of treeNodes) {
      sortTree(node.children)
    }
  }

  const attachProductCounts = async (treeNodes: CategoryNode[]) => {
    const allNodes = [...nodes.values()]

    const directProducts = await payload.find({
      collection: 'products',
      depth: 0,
      draft: false,
      limit: 12000,
      overrideAccess: false,
      pagination: false,
      select: {
        categories: true,
      },
      where: {
        published: {
          equals: true,
        },
      },
    })

    for (const product of directProducts.docs) {
      if (!Array.isArray(product.categories)) continue

      for (const categoryRef of product.categories) {
        const categoryID = typeof categoryRef === 'string' ? categoryRef : categoryRef?.id
        if (!categoryID) continue

        const node = nodes.get(String(categoryID))
        if (!node) continue

        node.productIDs.add(String(product.id))
      }
    }

    const accumulateCounts = (node: CategoryNode): Set<string> => {
      const aggregateIDs = new Set(node.productIDs)

      for (const child of node.children) {
        for (const productID of accumulateCounts(child)) {
          aggregateIDs.add(productID)
        }
      }

      node.productCount = aggregateIDs.size
      return aggregateIDs
    }

    for (const rootNode of treeNodes) {
      accumulateCounts(rootNode)
    }

    for (const node of allNodes) {
      node.productIDs.clear()
    }
  }

  sortTree(rootNodes)
  await attachProductCounts(rootNodes)

  return <CategoriesPanel categories={rootNodes} />
}

const skeleton = 'mb-3 h-4 w-5/6 animate-pulse rounded'
const activeAndTitles = 'bg-neutral-800 dark:bg-neutral-300'
const items = 'bg-neutral-400 dark:bg-neutral-700'

export function Categories() {
  return (
    <Suspense
      fallback={
        <div className="col-span-2 hidden h-[400px] w-full flex-none py-4 lg:block">
          <div className={clsx(skeleton, activeAndTitles)} />
          <div className={clsx(skeleton, activeAndTitles)} />
          <div className={clsx(skeleton, items)} />
          <div className={clsx(skeleton, items)} />
          <div className={clsx(skeleton, items)} />
          <div className={clsx(skeleton, items)} />
          <div className={clsx(skeleton, items)} />
          <div className={clsx(skeleton, items)} />
          <div className={clsx(skeleton, items)} />
          <div className={clsx(skeleton, items)} />
        </div>
      }
    >
      <CategoryList />
    </Suspense>
  )
}
