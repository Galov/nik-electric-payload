import 'dotenv/config'

import fs from 'node:fs/promises'
import path from 'node:path'

import configPromise from '@payload-config'
import { getPayload } from 'payload'

type ExportRow = {
  approved: string
  companyAddress: string
  companyCity: string
  companyEIK: string
  companyName: string
  contactName: string
  email: string
  legacyWPUserId: string
  partnerCode: string
  phone: string
  priceTier: string
}

const REPORTS_DIR = path.resolve(process.cwd(), 'reports')
const DATE_STAMP = new Date().toISOString().slice(0, 10)
const CSV_PATH = path.join(REPORTS_DIR, `customer-price-groups-partner-codes-${DATE_STAMP}.csv`)
const JSON_PATH = path.join(REPORTS_DIR, `customer-price-groups-partner-codes-${DATE_STAMP}.json`)

const PRICE_TIER_LABELS: Record<string, string> = {
  general: 'Обща',
  group1: 'Ценова група 1',
}

const clean = (value: null | string | undefined) => (typeof value === 'string' ? value.trim() : '')

const escapeCSV = (value: string) => `"${value.replaceAll('"', '""')}"`

const toContactName = (firstName: string, lastName: string, fallbackName: string, email: string) => {
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim()

  if (fullName) return fullName
  if (fallbackName) return fallbackName
  return email
}

const toPriceTierLabel = (value: null | string | undefined) => {
  const cleaned = clean(value)
  return PRICE_TIER_LABELS[cleaned] || cleaned || 'Обща'
}

const main = async () => {
  const payload = await getPayload({ config: configPromise })
  const rows: ExportRow[] = []

  let page = 1
  let hasNextPage = true

  while (hasNextPage) {
    const result = await payload.find({
      collection: 'users',
      depth: 0,
      limit: 200,
      overrideAccess: true,
      page,
      pagination: true,
      select: {
        approved: true,
        companyAddress: true,
        companyCity: true,
        companyEIK: true,
        companyName: true,
        email: true,
        firstName: true,
        lastName: true,
        legacyWPUserId: true,
        name: true,
        partnerCode: true,
        phone: true,
        priceTier: true,
        roles: true,
      },
      sort: 'companyName',
    })

    for (const doc of result.docs) {
      const roles = Array.isArray(doc.roles) ? doc.roles : []

      if (!roles.includes('customer') || doc.approved !== true) {
        continue
      }

      rows.push({
        approved: 'Да',
        companyAddress: clean(doc.companyAddress),
        companyCity: clean(doc.companyCity),
        companyEIK: clean(doc.companyEIK),
        companyName: clean(doc.companyName),
        contactName: toContactName(
          clean(doc.firstName),
          clean(doc.lastName),
          clean(doc.name),
          clean(doc.email),
        ),
        email: clean(doc.email),
        legacyWPUserId: doc.legacyWPUserId ? String(doc.legacyWPUserId) : '',
        partnerCode: clean(doc.partnerCode),
        phone: clean(doc.phone),
        priceTier: toPriceTierLabel(doc.priceTier),
      })
    }

    hasNextPage = result.hasNextPage
    page += 1
  }

  rows.sort((a, b) => {
    return (
      a.companyName.localeCompare(b.companyName, 'bg', { sensitivity: 'base' }) ||
      a.contactName.localeCompare(b.contactName, 'bg', { sensitivity: 'base' }) ||
      a.email.localeCompare(b.email, 'bg', { sensitivity: 'base' })
    )
  })

  const headers = [
    'Legacy WP User ID',
    'Име за контакт',
    'Фирма',
    'ЕИК',
    'Имейл',
    'Телефон',
    'Град',
    'Адрес',
    'Ценова група',
    'partnerCode',
    'Одобрен',
  ]

  const csvLines = [
    headers.map(escapeCSV).join(';'),
    ...rows.map((row) =>
      [
        row.legacyWPUserId,
        row.contactName,
        row.companyName,
        row.companyEIK,
        row.email,
        row.phone,
        row.companyCity,
        row.companyAddress,
        row.priceTier,
        row.partnerCode,
        row.approved,
      ]
        .map(escapeCSV)
        .join(';'),
    ),
  ]

  await fs.mkdir(REPORTS_DIR, { recursive: true })
  await fs.writeFile(CSV_PATH, `\uFEFF${csvLines.join('\n')}\n`, 'utf8')
  await fs.writeFile(
    JSON_PATH,
    `${JSON.stringify(
      {
        csvPath: CSV_PATH,
        exportedAt: new Date().toISOString(),
        totalCustomers: rows.length,
      },
      null,
      2,
    )}\n`,
    'utf8',
  )

  console.log(
    JSON.stringify(
      {
        csvPath: CSV_PATH,
        jsonPath: JSON_PATH,
        totalCustomers: rows.length,
      },
      null,
      2,
    ),
  )
}

void main()
