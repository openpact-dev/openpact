// 8 hex chars of the writer public key = 32 bits of entropy on the
// writer-slot component. Paired with a per-writer monotonic seq, this
// keeps entry-id collisions vanishingly rare across a pact: two writers
// would need to share the first 4 bytes of their 32-byte key for their
// ids to ever overlap, and the seq half would still differ if the
// writers are at different log heights.
//
// BREAKING: pre-v0.1.0 daemons used a 4-hex prefix. Migrations from
// older deployments require a wipe — no backwards compatibility is
// attempted here.
const ID_RE = /^([0-9a-f]{8})-(\d+)$/
const SHORT_LEN = 8

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
  if (hex.length < SHORT_LEN) {
    throw new TypeError(`writerKey must encode to at least ${SHORT_LEN} hex chars`)
  }
  return `${hex.slice(0, SHORT_LEN)}-${seq}`
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

export { SHORT_LEN }
