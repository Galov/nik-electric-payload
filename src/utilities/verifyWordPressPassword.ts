import crypto from 'node:crypto'

const ITOA64 = './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

const md5 = (value: Buffer | string) => crypto.createHash('md5').update(value).digest()

const encode64 = (input: Buffer, count: number) => {
  let output = ''
  let index = 0

  do {
    let value = input[index++] || 0
    output += ITOA64[value & 0x3f] || ''

    if (index < count) {
      value |= (input[index] || 0) << 8
    }

    output += ITOA64[(value >> 6) & 0x3f] || ''

    if (index++ >= count) {
      break
    }

    if (index < count) {
      value |= (input[index] || 0) << 16
    }

    output += ITOA64[(value >> 12) & 0x3f] || ''

    if (index++ >= count) {
      break
    }

    output += ITOA64[(value >> 18) & 0x3f] || ''
  } while (index < count)

  return output
}

const cryptPortableHash = (password: string, storedHash: string) => {
  const hashType = storedHash.slice(0, 3)

  if (hashType !== '$P$' && hashType !== '$H$') {
    return null
  }

  const countLog2 = ITOA64.indexOf(storedHash[3] || '')

  if (countLog2 < 7 || countLog2 > 30) {
    return null
  }

  const salt = storedHash.slice(4, 12)

  if (salt.length !== 8) {
    return null
  }

  let hash = md5(Buffer.concat([Buffer.from(salt), Buffer.from(password)]))
  let count = 1 << countLog2

  while (count > 0) {
    hash = md5(Buffer.concat([hash, Buffer.from(password)]))
    count -= 1
  }

  return storedHash.slice(0, 12) + encode64(hash, 16)
}

export const verifyWordPressPassword = (password: string, storedHash: null | string | undefined) => {
  if (!storedHash || typeof storedHash !== 'string') {
    return false
  }

  const calculatedHash = cryptPortableHash(password, storedHash)

  if (!calculatedHash) {
    return false
  }

  return calculatedHash === storedHash
}
