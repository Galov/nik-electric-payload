import 'dotenv/config'

import fs from 'node:fs'
import path from 'node:path'

import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { parseWooCommerceDump } from './woocommerce/parseDump'

const DUMP_PATH = path.resolve(process.cwd(), '../nikelect_woocdb2019.sql')
const REPORTS_DIR = path.resolve(process.cwd(), 'reports')
const DRY_RUN = process.argv.includes('--dry-run')

type LegacyBrandMap = Map<string, number[]>

type ProductBrandRelation =
  | string
  | {
      id?: number | string
      title?: null | string
    }

type SyncReport = {
  dryRun: boolean
  dumpPath: string
  processed: number
  updated: number
  unchanged: number
  missingSku: Array<{ id: string; title: string }>
  missingLegacyCompatibility: Array<{ id: string; sku: string; title: string }>
  unresolvedBrandTaxonomyIds: Array<{ id: string; sku: string; title: string; taxonomyIds: number[] }>
  updateErrors: Array<{ id: string; sku: string; title: string; error: string }>
}

const normalizeSku = (value: string | null | undefined) => value?.trim() || ''

const normalizeCurrentBrandIds = (value: ProductBrandRelation | ProductBrandRelation[] | null | undefined) => {
  if (!value) {
    return []
  }

  const source = Array.isArray(value) ? value : [value]

  return source
    .map((item) => {
      if (typeof item === 'string') {
        return item
      }

      return typeof item.id === 'string' ? item.id : typeof item.id === 'number' ? String(item.id) : null
    })
    .filter((item): item is string => Boolean(item))
}

const arraysMatch = (left: string[], right: string[]) => {
  if (left.length !== right.length) {
    return false
  }

  return left.every((value, index) => value === right[index])
}

const buildLegacyBrandMap = async (): Promise<LegacyBrandMap> => {
  const source = await parseWooCommerceDump(DUMP_PATH)
  const skuToBrandTaxonomyIds = new Map<string, Set<number>>()

  for (const [postId, post] of source.posts.entries()) {
    const meta = source.postMeta.get(postId)
    const sku = normalizeSku(meta?.get('_sku'))

    if (!sku) {
      continue
    }

    const relationships = source.termRelationships.get(post.id) || []

    for (const taxonomyId of relationships) {
      const taxonomy = source.termTaxonomies.get(taxonomyId)

      if (!taxonomy || taxonomy.taxonomy !== 'pwb-brand') {
        continue
      }

      const existing = skuToBrandTaxonomyIds.get(sku) || new Set<number>()
      existing.add(taxonomy.id)
      skuToBrandTaxonomyIds.set(sku, existing)
    }
  }

  return new Map(
    Array.from(skuToBrandTaxonomyIds.entries()).map(([sku, ids]) => [sku, Array.from(ids).sort((a, b) => a - b)]),
  )
}

const main = async () => {
  const payload = await getPayload({ config: configPromise })
  const legacyBrandMap = await buildLegacyBrandMap()

  const brands = await payload.find({
    collection: 'brands',
    depth: 0,
    limit: 1000,
    overrideAccess: true,
    pagination: false,
    select: {
      sourceTaxonomyId: true,
      title: true,
    },
    sort: 'title',
  })

  const brandIdBySourceTaxonomyId = new Map<number, string>()

  for (const brand of brands.docs) {
    if (typeof brand.sourceTaxonomyId === 'number') {
      brandIdBySourceTaxonomyId.set(brand.sourceTaxonomyId, brand.id)
    }
  }

  const report: SyncReport = {
    dryRun: DRY_RUN,
    dumpPath: DUMP_PATH,
    missingLegacyCompatibility: [],
    missingSku: [],
    processed: 0,
    unchanged: 0,
    unresolvedBrandTaxonomyIds: [],
    updateErrors: [],
    updated: 0,
  }

  let page = 1
  const limit = 250

  while (true) {
    const products = await payload.find({
      collection: 'products',
      depth: 1,
      limit,
      overrideAccess: true,
      page,
      pagination: true,
      select: {
        brand: true,
        sku: true,
        title: true,
      },
      sort: 'id',
    })

    for (const product of products.docs) {
      report.processed += 1

      const sku = normalizeSku(product.sku)

      if (!sku) {
        report.missingSku.push({ id: product.id, title: product.title })
        continue
      }

      const currentBrandIds = normalizeCurrentBrandIds(product.brand as ProductBrandRelation | ProductBrandRelation[] | null | undefined)
      const legacyTaxonomyIds = legacyBrandMap.get(sku) || []

      if (legacyTaxonomyIds.length === 0) {
        if (currentBrandIds.length === 0) {
          report.missingLegacyCompatibility.push({ id: product.id, sku, title: product.title })
        } else {
          const normalizedCurrent = [...new Set(currentBrandIds)].sort()
          const normalizedNext = [...normalizedCurrent]

          if (arraysMatch(normalizedCurrent, normalizedNext)) {
            report.unchanged += 1
          }
        }
        continue
      }

      const resolvedLegacyBrandIds: string[] = []
      const unresolvedTaxonomyIds: number[] = []

      for (const taxonomyId of legacyTaxonomyIds) {
        const brandId = brandIdBySourceTaxonomyId.get(taxonomyId)

        if (!brandId) {
          unresolvedTaxonomyIds.push(taxonomyId)
          continue
        }

        resolvedLegacyBrandIds.push(brandId)
      }

      if (unresolvedTaxonomyIds.length > 0) {
        report.unresolvedBrandTaxonomyIds.push({
          id: product.id,
          sku,
          taxonomyIds: unresolvedTaxonomyIds,
          title: product.title,
        })
      }

      const nextBrandIds = [...new Set([...currentBrandIds, ...resolvedLegacyBrandIds])].sort()
      const normalizedCurrent = [...new Set(currentBrandIds)].sort()

      if (arraysMatch(normalizedCurrent, nextBrandIds)) {
        report.unchanged += 1
        continue
      }

      if (DRY_RUN) {
        report.updated += 1
        continue
      }

      try {
        await payload.update({
          id: product.id,
          collection: 'products',
          data: {
            brand: nextBrandIds,
          },
          overrideAccess: true,
        })

        report.updated += 1
      } catch (error) {
        report.updateErrors.push({
          error: error instanceof Error ? error.message : 'Unknown error',
          id: product.id,
          sku,
          title: product.title,
        })
      }
    }

    if (!products.hasNextPage) {
      break
    }

    page += 1
  }

  fs.mkdirSync(REPORTS_DIR, { recursive: true })

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const reportPath = path.join(REPORTS_DIR, `compatibility-brand-sync-${timestamp}.json`)

  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  console.log(
    JSON.stringify(
      {
        dryRun: report.dryRun,
        missingLegacyCompatibility: report.missingLegacyCompatibility.length,
        missingSku: report.missingSku.length,
        processed: report.processed,
        reportPath,
        unresolvedBrandTaxonomyIds: report.unresolvedBrandTaxonomyIds.length,
        updateErrors: report.updateErrors.length,
        updated: report.updated,
        unchanged: report.unchanged,
      },
      null,
      2,
    ),
  )
}

void main()
