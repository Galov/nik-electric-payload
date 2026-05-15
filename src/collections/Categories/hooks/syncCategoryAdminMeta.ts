import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  Payload,
} from 'payload'

type CategoryNode = {
  adminLabel?: null | string
  adminSort?: null | string
  id: string
  parent?: null | string
  title: string
}

const SKIP_SYNC_FLAG = 'skipCategoryAdminMetaSync'

const collator = new Intl.Collator('bg', {
  numeric: true,
  sensitivity: 'base',
})

const normalizeParentID = (value: unknown) => {
  if (typeof value === 'string') return value

  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string') {
    return (value as { id: string }).id
  }

  return null
}

const normalizeTitle = (value: unknown) => {
  if (typeof value !== 'string') return ''

  return value.trim()
}

const buildAdminLabel = (path: string[]) => path.join(' / ')

const buildAdminSort = (path: string[]) => path.map((segment) => segment.toLocaleLowerCase('bg')).join(' / ')

const loadCategories = async (payload: Payload): Promise<CategoryNode[]> => {
  const result = await payload.find({
    collection: 'categories',
    depth: 0,
    limit: 1000,
    overrideAccess: true,
    pagination: false,
    select: {
      adminLabel: true,
      adminSort: true,
      parent: true,
      title: true,
    },
  })

  return result.docs
    .map((doc) => ({
      adminLabel: typeof doc.adminLabel === 'string' ? doc.adminLabel : null,
      adminSort: typeof doc.adminSort === 'string' ? doc.adminSort : null,
      id: doc.id,
      parent: normalizeParentID(doc.parent),
      title: normalizeTitle(doc.title),
    }))
    .filter((doc) => Boolean(doc.title))
}

export const syncCategoryAdminMeta = async (payload: Payload) => {
  const categories = await loadCategories(payload)
  const categoryByID = new Map(categories.map((category) => [category.id, category]))
  const childrenByParentID = new Map<string | null, CategoryNode[]>()

  for (const category of categories) {
    const parentID = category.parent && categoryByID.has(category.parent) ? category.parent : null
    const siblings = childrenByParentID.get(parentID) || []
    siblings.push(category)
    childrenByParentID.set(parentID, siblings)
  }

  for (const siblings of childrenByParentID.values()) {
    siblings.sort((left, right) => collator.compare(left.title, right.title))
  }

  const updates: Array<{ id: string; adminLabel: string; adminSort: string }> = []

  const visit = (parentID: null | string, path: string[]) => {
    const siblings = childrenByParentID.get(parentID) || []

    for (const category of siblings) {
      const nextPath = [...path, category.title]
      const adminLabel = buildAdminLabel(nextPath)
      const adminSort = buildAdminSort(nextPath)

      if (category.adminLabel !== adminLabel || category.adminSort !== adminSort) {
        updates.push({ adminLabel, adminSort, id: category.id })
      }

      visit(category.id, nextPath)
    }
  }

  visit(null, [])

  for (const update of updates) {
    await payload.update({
      collection: 'categories',
      id: update.id,
      data: {
        adminLabel: update.adminLabel,
        adminSort: update.adminSort,
      },
      depth: 0,
      overrideAccess: true,
      context: {
        [SKIP_SYNC_FLAG]: true,
      },
    })
  }
}

export const syncCategoryAdminMetaAfterChange: CollectionAfterChangeHook = async ({
  req,
  doc,
}) => {
  if (req.context?.[SKIP_SYNC_FLAG]) {
    return doc
  }

  await syncCategoryAdminMeta(req.payload)

  return doc
}

export const syncCategoryAdminMetaAfterDelete: CollectionAfterDeleteHook = async ({
  req,
  doc,
}) => {
  if (req.context?.[SKIP_SYNC_FLAG]) {
    return doc
  }

  await syncCategoryAdminMeta(req.payload)

  return doc
}
