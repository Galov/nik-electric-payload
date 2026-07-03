import 'dotenv/config'

import fs from 'node:fs/promises'
import path from 'node:path'

import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { normalizeBrands, normalizeCategories } from './woocommerce/mapData'
import { parseWooCommerceDump } from './woocommerce/parseDump'

type TaxonomyDoc = {
  id: string
  slug?: null | string
  sourceTaxonomyId?: null | number
  sourceTermId?: null | number
  title?: null | string
}

type LegacyTaxonomy = {
  slug: string
  sourceTaxonomyId: number
  sourceTermId: number
  title: string
}

const dumpArg = process.argv.find((arg) => arg.startsWith('--dump='))
const reportArg = process.argv.find((arg) => arg.startsWith('--report='))

if (!dumpArg) {
  throw new Error('Missing --dump=/absolute/path/to/sql')
}

const dumpPath = path.resolve(process.cwd(), dumpArg.replace('--dump=', ''))
const reportPath = reportArg
  ? path.resolve(process.cwd(), reportArg.replace('--report=', ''))
  : path.resolve(process.cwd(), 'reports/legacy-taxonomy-comparison.json')

const normalizeText = (value: null | string | undefined) => (typeof value === 'string' ? value.trim() : '')

const compareTaxonomies = (legacyItems: LegacyTaxonomy[], dbItems: TaxonomyDoc[]) => {
  const legacyBySourceTaxonomyId = new Map(legacyItems.map((item) => [item.sourceTaxonomyId, item]))
  const dbBySourceTaxonomyId = new Map(
    dbItems
      .filter((item): item is TaxonomyDoc & { sourceTaxonomyId: number } => typeof item.sourceTaxonomyId === 'number')
      .map((item) => [item.sourceTaxonomyId, item]),
  )

  const missingInDb = legacyItems
    .filter((item) => !dbBySourceTaxonomyId.has(item.sourceTaxonomyId))
    .map((item) => ({
      slug: item.slug,
      sourceTaxonomyId: item.sourceTaxonomyId,
      sourceTermId: item.sourceTermId,
      title: item.title,
    }))

  const missingInLegacy = dbItems
    .filter((item) => typeof item.sourceTaxonomyId === 'number' && !legacyBySourceTaxonomyId.has(item.sourceTaxonomyId))
    .map((item) => ({
      id: item.id,
      slug: item.slug ?? null,
      sourceTaxonomyId: item.sourceTaxonomyId ?? null,
      sourceTermId: item.sourceTermId ?? null,
      title: item.title ?? null,
    }))

  const fieldMismatches = legacyItems
    .map((legacyItem) => {
      const dbItem = dbBySourceTaxonomyId.get(legacyItem.sourceTaxonomyId)

      if (!dbItem) return null

      const mismatches: string[] = []

      if (normalizeText(dbItem.title) !== legacyItem.title) mismatches.push('title')
      if (normalizeText(dbItem.slug) !== legacyItem.slug) mismatches.push('slug')
      if ((dbItem.sourceTermId ?? null) !== legacyItem.sourceTermId) mismatches.push('sourceTermId')

      if (!mismatches.length) return null

      return {
        db: {
          id: dbItem.id,
          slug: dbItem.slug ?? null,
          sourceTaxonomyId: dbItem.sourceTaxonomyId ?? null,
          sourceTermId: dbItem.sourceTermId ?? null,
          title: dbItem.title ?? null,
        },
        legacy: legacyItem,
        mismatches,
      }
    })
    .filter(Boolean)

  return {
    fieldMismatches,
    missingInDb,
    missingInLegacy,
    summary: {
      db: dbItems.length,
      exactMatches:
        legacyItems.length -
        missingInDb.length -
        fieldMismatches.length,
      legacy: legacyItems.length,
      mismatched: fieldMismatches.length,
      missingInDb: missingInDb.length,
      missingInLegacy: missingInLegacy.length,
    },
  }
}

const main = async () => {
  const payload = await getPayload({ config: configPromise })
  const dump = await parseWooCommerceDump(dumpPath)
  const legacyCategories = normalizeCategories(dump)
  const legacyBrands = normalizeBrands(dump)

  const [dbCategories, dbBrands] = await Promise.all([
    payload.find({
      collection: 'categories',
      depth: 0,
      limit: 2000,
      overrideAccess: true,
      pagination: false,
      select: {
        slug: true,
        sourceTaxonomyId: true,
        sourceTermId: true,
        title: true,
      },
    }),
    payload.find({
      collection: 'brands',
      depth: 0,
      limit: 2000,
      overrideAccess: true,
      pagination: false,
      select: {
        slug: true,
        sourceTaxonomyId: true,
        sourceTermId: true,
        title: true,
      },
    }),
  ])

  const report = {
    categories: compareTaxonomies(legacyCategories, dbCategories.docs as TaxonomyDoc[]),
    generatedAt: new Date().toISOString(),
    brands: compareTaxonomies(legacyBrands, dbBrands.docs as TaxonomyDoc[]),
    dumpPath,
  }

  await fs.mkdir(path.dirname(reportPath), { recursive: true })
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  console.log(JSON.stringify(report, null, 2))
}

void main()
