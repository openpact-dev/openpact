const ID_RE = /^([0-9a-f]{4})-(\d+)$/

function toHex(input) {
  if (typeof input === 'string') return input.toLowerCase()
  if (input && typeof input.toString === 'function') return input.toString('hex').toLowerCase()
  throw new TypeError('writerKey must be a Buffer or hex string')
}

function encode({ writerKey, seq }) {
  if (!Number.isInteger(seq) || seq < 0) throw new TypeError('seq must be a non-negative integer')
  const hex = toHex(writerKey)
  if (hex.length < 4) throw new TypeError('writerKey must encode to at least 4 hex chars')
  return `${hex.slice(0, 4)}-${seq}`
}

function decode(id) {
  if (typeof id !== 'string') throw new TypeError('id must be a string')
  const m = ID_RE.exec(id)
  if (!m) throw new Error(`invalid entry id: ${id}`)
  return { writerShort: m[1], seq: Number(m[2]) }
}

function isValid(id) {
  return typeof id === 'string' && ID_RE.test(id)
}

module.exports = { encode, decode, isValid }
