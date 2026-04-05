import 'dotenv/config'

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'

import configPromise from '@payload-config'
import { getPayload } from 'payload'

import type { User } from '@/payload-types'

import { decodeSQLValue, parseInsertStatement } from './woocommerce/sql'

const DUMP_PATH = path.resolve(process.cwd(), '../nikelect_woocdb2019.sql')
const REPORTS_DIR = path.resolve(process.cwd(), 'reports')
const DRY_RUN = process.argv.includes('--dry-run')
const TARGET_TABLES = new Set(['nk_users', 'nk_usermeta'])

type LegacyUser = {
  displayName: string
  email: string
  id: number
  passwordHash: string
  registeredAt: string
  username: string
}

type LegacyMeta = Map<string, string>

type LegacyCustomer = {
  email: string
  legacyUserId: number
  legacyWPPasswordHash: string
  legacyWPUsername: string
  companyAddress: string
  companyCity: string
  companyEIK: string
  companyName: string
  firstName: string
  lastName: string
  phone: string
  usedFallbacks: string[]
}

type ImportReport = {
  created: number
  dryRun: boolean
  dumpPath: string
  invalidUsers: Array<{ id: number; reason: string }>
  processed: number
  reportPath?: string
  updateErrors: Array<{ email: string; error: string; legacyUserId: number }>
  updated: number
  usersWithFallbacks: Array<{ email: string; fallbacks: string[]; legacyUserId: number }>
}

const clean = (value: null | string | undefined) => value?.trim() || ''
const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

const parseLegacyCustomers = async () => {
  const users = new Map<number, LegacyUser>()
  const userMeta = new Map<number, LegacyMeta>()
  const stream = fs.createReadStream(DUMP_PATH, { encoding: 'utf8' })
  const reader = readline.createInterface({ input: stream, crlfDelay: Infinity })

  let activeTable: null | string = null
  let statement = ''

  for await (const line of reader) {
    if (!activeTable) {
      const insertMatch = line.match(/^INSERT INTO `([^`]+)`/)
      const table = insertMatch?.[1]

      if (!table || !TARGET_TABLES.has(table)) continue

      activeTable = table
      statement = line
    } else {
      statement += `\n${line}`
    }

    if (!activeTable || !line.trim().endsWith(';')) continue

    const parsed = parseInsertStatement(statement)

    if (parsed) {
      if (parsed.table === 'nk_users') {
        ingestUsers(parsed.columns, parsed.rows, users)
      }

      if (parsed.table === 'nk_usermeta') {
        ingestUserMeta(parsed.columns, parsed.rows, userMeta)
      }
    }

    activeTable = null
    statement = ''
  }

  const invalidUsers: ImportReport['invalidUsers'] = []
  const customers: LegacyCustomer[] = []

  for (const [userId, user] of users.entries()) {
    const meta = userMeta.get(userId)
    const capabilities = meta?.get('nk_capabilities') || ''
    const status = meta?.get('pw_user_status') || ''

    if (!capabilities.includes('customer') || status !== 'approved') {
      continue
    }

    if (!user.email) {
      invalidUsers.push({ id: userId, reason: 'Липсва имейл.' })
      continue
    }

    if (!isValidEmail(user.email)) {
      invalidUsers.push({ id: userId, reason: `Невалиден имейл: ${user.email}` })
      continue
    }

    if (!user.passwordHash) {
      invalidUsers.push({ id: userId, reason: 'Липсва legacy password hash.' })
      continue
    }

    customers.push(buildLegacyCustomer(user, meta || new Map()))
  }

  return { customers, invalidUsers }
}

const buildLegacyCustomer = (user: LegacyUser, meta: LegacyMeta): LegacyCustomer => {
  const usedFallbacks: string[] = []

  const firstName = resolveField(
    [meta.get('first_name'), meta.get('billing_first_name'), user.displayName, user.username],
    `Потребител ${user.id}`,
    'firstName',
    usedFallbacks,
  )
  const lastName = resolveField([meta.get('last_name'), meta.get('billing_last_name')], 'Legacy', 'lastName', usedFallbacks)
  const companyName = resolveField(
    [meta.get('billing_company'), `${firstName} ${lastName}`.trim(), user.displayName, user.email],
    `Липсва фирма (${user.id})`,
    'companyName',
    usedFallbacks,
  )
  const companyEIK = resolveField(
    [meta.get('billing_eik')],
    `LIPSVA-EIK-${user.id}`,
    'companyEIK',
    usedFallbacks,
  )
  const companyCity = resolveField(
    [meta.get('billing_city')],
    'Не е посочен',
    'companyCity',
    usedFallbacks,
  )
  const companyAddress = resolveField(
    [meta.get('billing_address_1'), meta.get('billing_address_2')],
    'Не е посочен',
    'companyAddress',
    usedFallbacks,
  )
  const phone = resolveField(
    [meta.get('billing_phone')],
    'Не е посочен',
    'phone',
    usedFallbacks,
  )

  return {
    companyAddress,
    companyCity,
    companyEIK,
    companyName,
    email: user.email,
    firstName,
    lastName,
    legacyUserId: user.id,
    legacyWPPasswordHash: user.passwordHash,
    legacyWPUsername: user.username,
    phone,
    usedFallbacks,
  }
}

const resolveField = (
  values: Array<null | string | undefined>,
  fallback: string,
  fieldName: string,
  usedFallbacks: string[],
) => {
  for (const value of values) {
    const cleaned = clean(value)

    if (cleaned) {
      return cleaned
    }
  }

  usedFallbacks.push(fieldName)
  return fallback
}

const ingestUsers = (columns: string[], rows: string[][], users: Map<number, LegacyUser>) => {
  for (const row of rows) {
    const record = Object.fromEntries(columns.map((column, index) => [column, decodeSQLValue(row[index] || '')]))
    const id = Number(record.ID)

    if (!Number.isFinite(id)) continue

    users.set(id, {
      displayName: clean(record.display_name),
      email: clean(record.user_email).toLowerCase(),
      id,
      passwordHash: clean(record.user_pass),
      registeredAt: clean(record.user_registered),
      username: clean(record.user_login),
    })
  }
}

const ingestUserMeta = (columns: string[], rows: string[][], userMeta: Map<number, LegacyMeta>) => {
  for (const row of rows) {
    const record = Object.fromEntries(columns.map((column, index) => [column, decodeSQLValue(row[index] || '')]))
    const userId = Number(record.user_id)
    const metaKey = clean(record.meta_key)

    if (!Number.isFinite(userId) || !metaKey) continue

    const meta = userMeta.get(userId) || new Map<string, string>()
    meta.set(metaKey, clean(record.meta_value))
    userMeta.set(userId, meta)
  }
}

const main = async () => {
  const payload = await getPayload({ config: configPromise })
  const { customers, invalidUsers } = await parseLegacyCustomers()

  const report: ImportReport = {
    created: 0,
    dryRun: DRY_RUN,
    dumpPath: DUMP_PATH,
    invalidUsers,
    processed: customers.length,
    updateErrors: [],
    updated: 0,
    usersWithFallbacks: [],
  }

  for (const customer of customers) {
    if (customer.usedFallbacks.length > 0) {
      report.usersWithFallbacks.push({
        email: customer.email,
        fallbacks: customer.usedFallbacks,
        legacyUserId: customer.legacyUserId,
      })
    }

    const existing = await payload.find({
      collection: 'users',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      select: {
        email: true,
        partnerCode: true,
        priceTier: true,
      },
      where: {
        email: {
          equals: customer.email,
        },
      },
    })

    const data: Partial<User> = {
      approved: true,
      companyAddress: customer.companyAddress,
      companyCity: customer.companyCity,
      companyEIK: customer.companyEIK,
      companyName: customer.companyName,
      email: customer.email,
      firstName: customer.firstName,
      lastName: customer.lastName,
      legacyWPPasswordHash: customer.legacyWPPasswordHash,
      legacyWPUserId: customer.legacyUserId,
      legacyWPUsername: customer.legacyWPUsername,
      phone: customer.phone,
      roles: ['customer'],
    }

    try {
      if (existing.docs[0]) {
        if (!DRY_RUN) {
          await payload.update({
            id: existing.docs[0].id,
            collection: 'users',
            data,
            overrideAccess: true,
            showHiddenFields: true,
          })
        }

        report.updated += 1
        continue
      }

      if (!DRY_RUN) {
        await payload.create({
          collection: 'users',
          data: {
            ...data,
            password: `legacy-${crypto.randomUUID()}`,
          },
          overrideAccess: true,
          showHiddenFields: true,
        })
      }

      report.created += 1
    } catch (error) {
      report.updateErrors.push({
        email: customer.email,
        error: error instanceof Error ? error.message : 'Unknown error',
        legacyUserId: customer.legacyUserId,
      })
    }
  }

  fs.mkdirSync(REPORTS_DIR, { recursive: true })
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const reportPath = path.join(REPORTS_DIR, `legacy-customer-import-${timestamp}.json`)
  report.reportPath = reportPath
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  console.log(
    JSON.stringify(
      {
        created: report.created,
        dryRun: report.dryRun,
        invalidUsers: report.invalidUsers.length,
        processed: report.processed,
        reportPath,
        updateErrors: report.updateErrors.length,
        updated: report.updated,
        usersWithFallbacks: report.usersWithFallbacks.length,
      },
      null,
      2,
    ),
  )
}

void main()
