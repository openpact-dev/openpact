import { wordList } from './word-list'

// 8 hex chars after the word gives 32 bits of identity entropy, up from
// 16. At 16 bits a pact of ~300 peers already has a >50% chance of a
// collision (birthday paradox, N = √(2·2^16)); 32 bits pushes that to
// ~78k peers. Combined with the two lookup bytes in the word slot that's
// effectively 48 random bits in the derived handle.
//
// NOTE: this is a breaking change. Pre-v0.1.0 daemons produce 4-hex
// handles and will fail agent-mismatch on the strict apply check. No
// migration path — operators are expected to wipe and restart.
export const HANDLE_RE = /^anon-[a-z]+-[0-9a-f]{8}$/

export type PublicKey = Buffer | string

function toBuffer(input: PublicKey): Buffer {
  if (Buffer.isBuffer(input)) return input
  if (typeof input === 'string') return Buffer.from(input, 'hex')
  throw new TypeError('publicKey must be a Buffer or hex string')
}

export function derive(publicKey: PublicKey): string {
  const buf = toBuffer(publicKey)
  // word index uses bytes [0..2), hex suffix uses bytes [2..6).
  if (buf.length < 6) throw new TypeError('publicKey must be at least 6 bytes')
  const wordIndex = (buf[0] + buf[1] * 256) % wordList.length
  const word = wordList[wordIndex]
  const suffix = buf.subarray(2, 6).toString('hex')
  return `anon-${word}-${suffix}`
}

export function isValid(handle: unknown): handle is string {
  return typeof handle === 'string' && HANDLE_RE.test(handle)
}

export { wordList }
