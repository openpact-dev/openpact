const test = require('brittle')
const fc = require('fast-check')
const peerHandle = require('../../src/peer-handle')

test('derive: standard case', (t) => {
  const buf = Buffer.from([0x12, 0x34, 0x7f, 0x2d, 0x99, 0x99])
  const handle = peerHandle.derive(buf)
  t.ok(peerHandle.isValid(handle))
  t.is(handle.endsWith('-7f2d'), true)
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
  t.exception.all(() => peerHandle.derive(Buffer.from([0x01, 0x02])))
})

test('derive: rejects non-buffer non-string', (t) => {
  t.exception.all(() => peerHandle.derive(42))
  t.exception.all(() => peerHandle.derive(null))
})

test('isValid', (t) => {
  t.ok(peerHandle.isValid('anon-krait-7f2d'))
  t.ok(peerHandle.isValid('anon-cobra-0000'))
  t.absent(peerHandle.isValid('anon-krait-7F2D')) // uppercase
  t.absent(peerHandle.isValid('krait-7f2d'))
  t.absent(peerHandle.isValid('anon-krait-7f2'))
  t.absent(peerHandle.isValid('anon--7f2d'))
})

test('property: same key always derives same handle and matches regex', (t) => {
  fc.assert(
    fc.property(fc.uint8Array({ minLength: 4, maxLength: 32 }), (bytes) => {
      const buf = Buffer.from(bytes)
      const a = peerHandle.derive(buf)
      const b = peerHandle.derive(buf)
      return a === b && peerHandle.isValid(a)
    }),
  )
  t.pass('property holds')
})

test('property: handles span the word list reasonably', (t) => {
  const seen = new Set()
  for (let i = 0; i < 256; i++) {
    for (let j = 0; j < 256; j++) {
      const buf = Buffer.from([i, j, 0, 0])
      const h = peerHandle.derive(buf)
      seen.add(h.split('-')[1])
    }
  }
  // Should hit most words in the list
  t.ok(seen.size >= peerHandle.wordList.length * 0.95, 'words used >= 95%')
})
