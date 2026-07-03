import 'dotenv/config'

import fs from 'node:fs/promises'
import path from 'node:path'

import configPromise from '@payload-config'
import { getPayload } from 'payload'

const REPORTS_DIR = path.resolve(process.cwd(), 'reports')
const DATE_STAMP = new Date().toISOString().replaceAll(':', '-')
const DEFAULT_FILE_PATH = path.resolve('/Users/ivogalov/Desktop/Spisak_Klienti (1).csv')
const APPLY = process.argv.includes('--write')
const fileArg = process.argv.find((arg) => arg.startsWith('--file='))
const FILE_PATH = fileArg ? path.resolve(process.cwd(), fileArg.replace('--file=', '')) : DEFAULT_FILE_PATH

type CsvCustomer = {
  approved: string
  email: string
  legacyWPUserId: string
  line: number
  name: string
  partnerCode: string
}

type Outcome =
  | 'deleted'
  | 'deleteCandidate'
  | 'emailNotFound'
  | 'idMismatch'
  | 'multipleEmailMatches'
  | 'skippedMissingEmail'
  | 'skippedMissingLegacyId'

type ReportRow = {
  csvApproved: string
  csvEmail: string
  csvLegacyWPUserId: string
  csvLine: number
  csvName: string
  csvPartnerCode: string
  dbCompanyName?: string
  dbEmail?: string
  dbId?: string
  dbLegacyWPUserId?: string
  dbPartnerCode?: string
  outcome: Outcome
}

const clean = (value: null | string | undefined) => (typeof value === 'string' ? value.trim() : '')

const normalizeApproval = (value: string) => clean(value).toLowerCase()

const parseCsvLine = (line: string) => {
  const cells: string[] = []
  let current = ''
  let insideQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]

    if (char === '"') {
      if (insideQuotes && next === '"') {
        current += '"'
        index += 1
        continue
      }

      insideQuotes = !insideQuotes
      continue
    }

    if (char === ';' && !insideQuotes) {
      cells.push(clean(current))
      current = ''
      continue
    }

    current += char
  }

  cells.push(clean(current))
  return cells
}

const parseCSV = async (filePath: string) => {
  const source = await fs.readFile(filePath, 'utf8')
  const rows = source
    .split(/\r?\n/)
    .map((line) => line.replace(/\uFEFF/g, ''))
    .filter(Boolean)
    .map(parseCsvLine)

  const dataRows = rows.slice(2)

  return dataRows.map((row, index) => ({
    approved: clean(row[10]),
    email: clean(row[4]),
    legacyWPUserId: clean(row[0]),
    line: index + 3,
    name: clean(row[1]),
    partnerCode: clean(row[9]),
  })) satisfies CsvCustomer[]
}

const main = async () => {
  const payload = await getPayload({ config: configPromise })
  const rows = await parseCSV(FILE_PATH)
  const toRemove = rows.filter((row) => normalizeApproval(row.approved) === 'не')
  const report: ReportRow[] = []

  let deleted = 0

  for (const row of toRemove) {
    if (!row.email) {
      report.push({
        csvApproved: row.approved,
        csvEmail: row.email,
        csvLegacyWPUserId: row.legacyWPUserId,
        csvLine: row.line,
        csvName: row.name,
        csvPartnerCode: row.partnerCode,
        outcome: 'skippedMissingEmail',
      })
      continue
    }

    if (!row.legacyWPUserId) {
      report.push({
        csvApproved: row.approved,
        csvEmail: row.email,
        csvLegacyWPUserId: row.legacyWPUserId,
        csvLine: row.line,
        csvName: row.name,
        csvPartnerCode: row.partnerCode,
        outcome: 'skippedMissingLegacyId',
      })
      continue
    }

    const result = await payload.find({
      collection: 'users',
      depth: 0,
      limit: 10,
      overrideAccess: true,
      pagination: false,
      select: {
        companyName: true,
        email: true,
        legacyWPUserId: true,
        partnerCode: true,
        roles: true,
      },
      where: {
        email: {
          equals: row.email,
        },
      },
    })

    const matches = result.docs.filter((doc) => Array.isArray(doc.roles) && doc.roles.includes('customer'))

    if (matches.length === 0) {
      report.push({
        csvApproved: row.approved,
        csvEmail: row.email,
        csvLegacyWPUserId: row.legacyWPUserId,
        csvLine: row.line,
        csvName: row.name,
        csvPartnerCode: row.partnerCode,
        outcome: 'emailNotFound',
      })
      continue
    }

    if (matches.length > 1) {
      for (const match of matches) {
        report.push({
          csvApproved: row.approved,
          csvEmail: row.email,
          csvLegacyWPUserId: row.legacyWPUserId,
          csvLine: row.line,
          csvName: row.name,
          csvPartnerCode: row.partnerCode,
          dbCompanyName: clean(match.companyName),
          dbEmail: clean(match.email),
          dbId: String(match.id),
          dbLegacyWPUserId:
            typeof match.legacyWPUserId === 'number' || typeof match.legacyWPUserId === 'string'
              ? String(match.legacyWPUserId)
              : '',
          dbPartnerCode: clean(match.partnerCode),
          outcome: 'multipleEmailMatches',
        })
      }
      continue
    }

    const match = matches[0]
    const dbPartnerCode = clean(match.partnerCode)
    const dbLegacyWPUserId =
      typeof match.legacyWPUserId === 'number' || typeof match.legacyWPUserId === 'string'
        ? String(match.legacyWPUserId)
        : ''

    if (row.legacyWPUserId && dbLegacyWPUserId && row.legacyWPUserId !== dbLegacyWPUserId) {
      report.push({
        csvApproved: row.approved,
        csvEmail: row.email,
        csvLegacyWPUserId: row.legacyWPUserId,
        csvLine: row.line,
        csvName: row.name,
        csvPartnerCode: row.partnerCode,
        dbCompanyName: clean(match.companyName),
        dbEmail: clean(match.email),
        dbId: String(match.id),
        dbLegacyWPUserId,
        dbPartnerCode,
        outcome: 'idMismatch',
      })
      continue
    }

    if (APPLY) {
      await payload.delete({
        collection: 'users',
        id: String(match.id),
        overrideAccess: true,
      })
      deleted += 1
    }

    report.push({
      csvApproved: row.approved,
      csvEmail: row.email,
      csvLegacyWPUserId: row.legacyWPUserId,
      csvLine: row.line,
      csvName: row.name,
      csvPartnerCode: row.partnerCode,
      dbCompanyName: clean(match.companyName),
      dbEmail: clean(match.email),
      dbId: String(match.id),
      dbLegacyWPUserId,
      dbPartnerCode,
      outcome: APPLY ? 'deleted' : 'deleteCandidate',
    })
  }

  const summary = report.reduce<Record<Outcome, number>>(
    (acc, row) => {
      acc[row.outcome] += 1
      return acc
    },
    {
      deleted: 0,
      deleteCandidate: 0,
      emailNotFound: 0,
      idMismatch: 0,
      multipleEmailMatches: 0,
      skippedMissingEmail: 0,
      skippedMissingLegacyId: 0,
    },
  )

  await fs.mkdir(REPORTS_DIR, { recursive: true })
  const reportPath = path.join(
    REPORTS_DIR,
    `remove-customers-from-approval-csv-${APPLY ? 'write' : 'dry-run'}-${DATE_STAMP}.json`,
  )

  await fs.writeFile(
    reportPath,
    `${JSON.stringify(
      {
        apply: APPLY,
        deleted,
        filePath: FILE_PATH,
        rowsMarkedNo: toRemove.length,
        summary,
        report,
      },
      null,
      2,
    )}\n`,
    'utf8',
  )

  console.log(
    JSON.stringify(
      {
        apply: APPLY,
        deleted,
        filePath: FILE_PATH,
        reportPath,
        rowsMarkedNo: toRemove.length,
        summary,
      },
      null,
      2,
    ),
  )
}

void main()
