import test from 'brittle'
import fc from 'fast-check'
import * as peerHandle from '../../src/peer-handle'

test('derive: standard case', (t) => {
  const buf = Buffer.from([0x12, 0x34, 0x7f, 0x2d, 0x99, 0x99])
  const handle = peerHandle.derive(buf)
  t.ok(peerHandle.isValid(handle))
  t.is(handle.endsWith('-7f2d9999'), true)
})

test('derive: deterministic', (t) => {
  const key = 'deadbeef00112233445566778899aabb'
  t.is(peerHandle.derive(key), peerHandle.derive(key))
})

test('derive: hex string and buffer agree', (t) => {
  const hex = 'abcdef0123456789'
  t.is(peerHandle.derive(hex), peerHandle.derive(Buffer.from(hex, 'hex')))
})

test('derive: rejects too-short input', (t) => {
  // need ≥6 bytes now: 2 for word index + 4 for hex suffix.
  t.exception.all(() => peerHandle.derive(Buffer.from([0x01, 0x02])))
  t.exception.all(() => peerHandle.derive(Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05])))
})

test('derive: rejects non-buffer non-string', (t) => {
  t.exception.all(() => peerHandle.derive(42 as any))
  t.exception.all(() => peerHandle.derive(null as any))
})

test('isValid', (t) => {
  t.ok(peerHandle.isValid('anon-krait-7f2d9999'))
  t.ok(peerHandle.isValid('anon-cobra-00000000'))
  t.absent(peerHandle.isValid('anon-krait-7F2D9999'))
  t.absent(peerHandle.isValid('krait-7f2d9999'))
  t.absent(peerHandle.isValid('anon-krait-7f2d')) // 4-hex form rejected
  t.absent(peerHandle.isValid('anon--7f2d9999'))
})

test('property: same key always derives same handle and matches regex', (t) => {
  fc.assert(
    fc.property(fc.uint8Array({ minLength: 6, maxLength: 32 }), (bytes) => {
      const buf = Buffer.from(bytes)
      const a = peerHandle.derive(buf)
      const b = peerHandle.derive(buf)
      return a === b && peerHandle.isValid(a)
    }),
  )
  t.pass('property holds')
})

test('property: handles span the word list reasonably', (t) => {
  const seen = new Set<string>()
  for (let i = 0; i < 256; i++) {
    for (let j = 0; j < 256; j++) {
      const buf = Buffer.from([i, j, 0, 0, 0, 0])
      const h = peerHandle.derive(buf)
      seen.add(h.split('-')[1])
    }
  }
  t.ok(seen.size >= peerHandle.wordList.length * 0.95, 'words used >= 95%')
})
