import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import type { CollectionAfterChangeHook } from 'payload'

const execFileAsync = promisify(execFile)

type OrderItem = {
  productMIId?: number | null
  productUnitPrice?: number | null
  quantity?: number | null
}

type OrderLike = {
  customer?: string | { id?: string | null; partnerCode?: string | null } | null
  id?: number | string
  items?: OrderItem[] | null
  miOrderExportStatus?: 'failed' | 'pending' | 'sent' | string | null
  partnerCode?: string | null
}

const getFTPConfig = () => {
  const url = process.env.MICROINVEST_ORDERS_FTP_URL?.trim()
  const user = process.env.MICROINVEST_ORDERS_FTP_USER?.trim()
  const password = process.env.MICROINVEST_ORDERS_FTP_PASSWORD?.trim()

  if (!url || !user || !password) {
    return null
  }

  return { password, url, user }
}

const sanitizeCell = (value: string) => value.replace(/[|\r\n]+/g, ' ').trim()

const formatNumber = (value: number) => {
  if (!Number.isFinite(value)) return ''
  return value.toFixed(2)
}

const normalizeItems = (value: unknown): OrderItem[] => {
  if (!Array.isArray(value)) return []

  return value.filter((item): item is OrderItem => Boolean(item && typeof item === 'object'))
}

const resolvePartnerCode = async ({
  order,
  req,
}: {
  order: OrderLike
  req: Parameters<CollectionAfterChangeHook>[0]['req']
}) => {
  const directPartnerCode = order.partnerCode?.trim()

  if (directPartnerCode) {
    return directPartnerCode
  }

  const customer = order.customer

  if (customer && typeof customer === 'object') {
    const objectPartnerCode = customer.partnerCode?.trim()

    if (objectPartnerCode) {
      return objectPartnerCode
    }

    if (typeof customer.id === 'string' && customer.id) {
      try {
        const user = await req.payload.findByID({
          collection: 'users',
          id: customer.id,
          depth: 0,
          overrideAccess: true,
          req,
        })

        if (typeof user?.partnerCode === 'string' && user.partnerCode.trim()) {
          return user.partnerCode.trim()
        }
      } catch {
        return null
      }
    }
  }

  if (typeof customer === 'string' && customer) {
    try {
      const user = await req.payload.findByID({
        collection: 'users',
        id: customer,
        depth: 0,
        overrideAccess: true,
        req,
      })

      if (typeof user?.partnerCode === 'string' && user.partnerCode.trim()) {
        return user.partnerCode.trim()
      }
    } catch {
      return null
    }
  }

  return null
}

const buildCSV = async ({
  order,
  req,
}: {
  order: OrderLike
  req: Parameters<CollectionAfterChangeHook>[0]['req']
}) => {
  const orderID = String(order.id || '').trim()
  const partnerCode = await resolvePartnerCode({ order, req })
  const items = normalizeItems(order.items)

  if (!orderID) {
    throw new Error('Order ID is missing.')
  }

  if (!partnerCode) {
    throw new Error('Partner code is missing.')
  }

  if (!items.length) {
    throw new Error('Order has no items.')
  }

  const documentNote = sanitizeCell(`Website order ${orderID}`)
  const header = 'partnerCode|id|qty|unitPrice|documentNote'
  const rows = items.map((item, index) => {
    if (typeof item.productMIId !== 'number' || !Number.isFinite(item.productMIId)) {
      throw new Error(`Item ${index + 1} is missing Microinvest product ID.`)
    }

    if (typeof item.quantity !== 'number' || !Number.isFinite(item.quantity) || item.quantity <= 0) {
      throw new Error(`Item ${index + 1} has invalid quantity.`)
    }

    if (
      typeof item.productUnitPrice !== 'number' ||
      !Number.isFinite(item.productUnitPrice) ||
      item.productUnitPrice < 0
    ) {
      throw new Error(`Item ${index + 1} is missing order unit price.`)
    }

    return [
      sanitizeCell(partnerCode),
      String(item.productMIId),
      formatNumber(item.quantity),
      formatNumber(item.productUnitPrice),
      documentNote,
    ].join('|')
  })

  return {
    csv: `${header}\n${rows.join('\n')}\n`,
    partnerCode,
  }
}

const uploadCSV = async ({ content, fileName }: { content: string; fileName: string }) => {
  const config = getFTPConfig()

  if (!config) {
    throw new Error('Microinvest FTP config is missing.')
  }

  const tempDir = await mkdtemp(path.join(tmpdir(), 'mi-order-export-'))
  const tempFile = path.join(tempDir, fileName)
  const baseURL = config.url.endsWith('/') ? config.url : `${config.url}/`
  const uploadURL = `${baseURL}${encodeURIComponent(fileName)}`

  try {
    await writeFile(tempFile, content, 'utf8')

    await execFileAsync('curl', [
      '--fail',
      '--silent',
      '--show-error',
      '--ftp-create-dirs',
      '--user',
      `${config.user}:${config.password}`,
      '--upload-file',
      tempFile,
      uploadURL,
    ])
  } finally {
    await rm(tempDir, { force: true, recursive: true })
  }
}

export const exportOrderToMicroinvestHook: CollectionAfterChangeHook = async ({
  doc,
  operation,
  req,
}) => {
  if (req.context?.skipMicroinvestOrderExport) {
    return doc
  }

  if (operation !== 'create' && operation !== 'update') {
    return doc
  }

  if (operation === 'update' && (doc as OrderLike).miOrderExportStatus === 'sent') {
    return doc
  }

  const fileName = `order-${String(doc.id)}.csv`

  try {
    const { csv, partnerCode } = await buildCSV({
      order: doc as OrderLike,
      req,
    })

    await uploadCSV({
      content: csv,
      fileName,
    })

    await req.payload.update({
      id: doc.id,
      collection: 'orders',
      context: {
        ...req.context,
        skipMicroinvestOrderExport: true,
      },
      data: {
        miOrderExportFileName: fileName,
        miOrderExportLastAttemptAt: new Date().toISOString(),
        miOrderExportLastError: '',
        miOrderExportStatus: 'sent',
        partnerCode,
      },
      overrideAccess: true,
      req,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown export error.'

    req.payload.logger.error({
      err: error,
      msg: `Microinvest order export failed for order ${String(doc.id)}`,
    })

    await req.payload.update({
      id: doc.id,
      collection: 'orders',
      context: {
        ...req.context,
        skipMicroinvestOrderExport: true,
      },
      data: {
        miOrderExportFileName: fileName,
        miOrderExportLastAttemptAt: new Date().toISOString(),
        miOrderExportLastError: message,
        miOrderExportStatus: 'failed',
      },
      overrideAccess: true,
      req,
    })
  }

  return doc
}
