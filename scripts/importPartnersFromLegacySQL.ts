import 'dotenv/config'

import fs from 'node:fs'
import readline from 'node:readline'

import configPromise from '@payload-config'
import { getPayload } from 'payload'

const SQL_PATH =
  '/Users/ivogalov/Downloads/Projects/NIK electric/NikElectricPayload/nikelect_woocdb2019.sql'

type LegacyStore = {
  title: string
  address: string
  city: string
  postalCode?: string
  phone?: string
  email?: string
  website?: string
  workingHours?: string
  latitude?: number
  longitude?: number
}

const stringifyWorkingHours = (raw: string | null) => {
  if (!raw) return ''

  try {
    const parsed = JSON.parse(raw) as Record<string, string | string[]>
    const dayLabels: Record<string, string> = {
      mon: 'Понеделник',
      tue: 'Вторник',
      wed: 'Сряда',
      thu: 'Четвъртък',
      fri: 'Петък',
      sat: 'Събота',
      sun: 'Неделя',
    }

    return Object.entries(dayLabels)
      .map(([key, label]) => {
        const value = parsed[key]

        if (!value || value === '0') {
          return `${label}: Почивен ден`
        }

        const hours = Array.isArray(value) ? value.join(', ') : value
        return `${label}: ${hours}`
      })
      .join('\n')
  } catch {
    return raw
  }
}

const cleanValue = (value: string | null | undefined) => {
  if (!value) return ''

  const trimmed = value.trim()

  if (!trimmed || trimmed.toUpperCase() === 'NULL') {
    return ''
  }

  return trimmed
}

const parseNumber = (value: string | null | undefined) => {
  const cleaned = cleanValue(value)
  if (!cleaned) return undefined

  const parsed = Number.parseFloat(cleaned)
  return Number.isFinite(parsed) ? parsed : undefined
}

const splitSQLTuple = (tuple: string) => {
  const values: string[] = []
  let current = ''
  let inString = false

  for (let index = 0; index < tuple.length; index += 1) {
    const char = tuple[index]
    const next = tuple[index + 1]

    if (char === "'" && inString && next === "'") {
      current += "'"
      index += 1
      continue
    }

    if (char === "'") {
      inString = !inString
      continue
    }

    if (char === ',' && !inString) {
      values.push(current.trim())
      current = ''
      continue
    }

    current += char
  }

  values.push(current.trim())

  return values
}

const extractStores = async () => {
  const stream = fs.createReadStream(SQL_PATH, 'utf8')
  const rl = readline.createInterface({
    crlfDelay: Infinity,
    input: stream,
  })

  let collecting = false
  let buffer = ''

  for await (const line of rl) {
    if (!collecting && line.startsWith('INSERT INTO `nk_asl_stores`')) {
      collecting = true
      buffer = `${line}\n`
      continue
    }

    if (collecting) {
      buffer += `${line}\n`

      if (line.trim().endsWith(';')) {
        break
      }
    }
  }

  rl.close()
  stream.close()

  if (!buffer) {
    throw new Error('Не намерих INSERT INTO `nk_asl_stores` в SQL dump-а.')
  }

  const valuesStart = buffer.indexOf('VALUES')
  const rawValues = buffer.slice(valuesStart + 'VALUES'.length).trim().replace(/;$/, '')
  const tuples = rawValues.match(/\((?:[^)(]+|'(?:[^']|'')*')+\)/g) ?? []

  return tuples
    .map((tuple) => tuple.slice(1, -1))
    .map(splitSQLTuple)
    .map((values): LegacyStore => {
      const [
        ,
        title,
        ,
        street,
        city,
        ,
        postalCode,
        ,
        lat,
        lng,
        phone,
        ,
        email,
        website,
        ,
        ,
        ,
        ,
        openHours,
      ] = values

      return {
        title: cleanValue(title),
        address: cleanValue(street),
        city: cleanValue(city),
        email: cleanValue(email) || undefined,
        latitude: parseNumber(lat),
        longitude: parseNumber(lng),
        phone: cleanValue(phone) || undefined,
        postalCode: cleanValue(postalCode) || undefined,
        website: cleanValue(website) || undefined,
        workingHours: stringifyWorkingHours(cleanValue(openHours)),
      }
    })
    .filter((store) => store.title && store.address && store.city)
}

const importPartners = async () => {
  const payload = await getPayload({ config: configPromise })
  const stores = await extractStores()

  let created = 0
  let updated = 0

  for (const store of stores) {
    const existing = await payload.find({
      collection: 'partners',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      where: {
        and: [
          { title: { equals: store.title } },
          { city: { equals: store.city } },
          { address: { equals: store.address } },
        ],
      },
    })

    const data = {
      address: store.address,
      city: store.city,
      email: store.email,
      latitude: store.latitude,
      longitude: store.longitude,
      phone: store.phone || 'Няма посочен телефон',
      postalCode: store.postalCode,
      title: store.title,
      website: store.website,
      workingHours: store.workingHours || 'Няма посочено работно време',
    }

    if (existing.docs[0]) {
      await payload.update({
        id: existing.docs[0].id,
        collection: 'partners',
        data,
        overrideAccess: true,
      })
      updated += 1
    } else {
      await payload.create({
        collection: 'partners',
        data,
        overrideAccess: true,
      })
      created += 1
    }
  }

  console.log(JSON.stringify({ created, total: stores.length, updated }, null, 2))
}

void importPartners()
