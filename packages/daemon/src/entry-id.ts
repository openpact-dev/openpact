const ID_RE = /^([0-9a-f]{4})-(\d+)$/

export type WriterKey = Buffer | string

export interface EncodeArgs {
  writerKey: WriterKey
  seq: number
}

export interface DecodedId {
  writerShort: string
  seq: number
}

function toHex(input: WriterKey): string {
  if (typeof input === 'string') return input.toLowerCase()
  if (input && typeof (input as Buffer).toString === 'function') {
    return (input as Buffer).toString('hex').toLowerCase()
  }
  throw new TypeError('writerKey must be a Buffer or hex string')
}

export function encode({ writerKey, seq }: EncodeArgs): string {
  if (!Number.isInteger(seq) || seq < 0) {
    throw new TypeError('seq must be a non-negative integer')
  }
  const hex = toHex(writerKey)
  if (hex.length < 4) throw new TypeError('writerKey must encode to at least 4 hex chars')
  return `${hex.slice(0, 4)}-${seq}`
}

export function decode(id: string): DecodedId {
  if (typeof id !== 'string') throw new TypeError('id must be a string')
  const m = ID_RE.exec(id)
  if (!m) throw new Error(`invalid entry id: ${id}`)
  return { writerShort: m[1], seq: Number(m[2]) }
}

export function isValid(id: unknown): id is string {
  return typeof id === 'string' && ID_RE.test(id)
}
