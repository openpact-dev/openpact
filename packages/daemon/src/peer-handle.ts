import { wordList } from './word-list'

export const HANDLE_RE = /^anon-[a-z]+-[0-9a-f]{4}$/

export type PublicKey = Buffer | string

function toBuffer(input: PublicKey): Buffer {
  if (Buffer.isBuffer(input)) return input
  if (typeof input === 'string') return Buffer.from(input, 'hex')
  throw new TypeError('publicKey must be a Buffer or hex string')
}

export function derive(publicKey: PublicKey): string {
  const buf = toBuffer(publicKey)
  if (buf.length < 4) throw new TypeError('publicKey must be at least 4 bytes')
  const wordIndex = (buf[0] + buf[1] * 256) % wordList.length
  const word = wordList[wordIndex]
  const suffix = buf.subarray(2, 4).toString('hex')
  return `anon-${word}-${suffix}`
}

export function isValid(handle: unknown): handle is string {
  return typeof handle === 'string' && HANDLE_RE.test(handle)
}

export { wordList }
