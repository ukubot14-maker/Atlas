import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

export const hashPassword = (password) => {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export const verifyPassword = (password, storedHash) => {
  if (!storedHash || !storedHash.includes(':')) {
    return false
  }

  const [salt, expectedHash] = storedHash.split(':')
  const derivedHash = scryptSync(password, salt, 64)
  const expectedBuffer = Buffer.from(expectedHash, 'hex')

  if (derivedHash.length !== expectedBuffer.length) {
    return false
  }

  return timingSafeEqual(derivedHash, expectedBuffer)
}
