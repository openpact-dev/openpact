import test from 'brittle'
import fc from 'fast-check'
import * as entryId from '../../src/entry-id'

test('encode: standard case', (t) => {
  const id = entryId.encode({ writerKey: 'a7f2bcde', seq: 412 })
  t.is(id, 'a7f2-412')
})

test('encode: accepts Buffer', (t) => {
  const buf = Buffer.from([0xa7, 0xf2, 0x12, 0x34])
  const id = entryId.encode({ writerKey: buf, seq: 0 })
  t.is(id, 'a7f2-0')
})

test('encode: rejects negative seq', (t) => {
  t.exception.all(() => entryId.encode({ writerKey: 'a7f2bcde', seq: -1 }))
})

test('encode: rejects non-integer seq', (t) => {
  t.exception.all(() => entryId.encode({ writerKey: 'a7f2bcde', seq: 1.5 }))
})

test('encode: rejects too-short key', (t) => {
  t.exception.all(() => entryId.encode({ writerKey: 'ab', seq: 0 }))
})

test('decode: round-trips', (t) => {
  const decoded = entryId.decode('a7f2-412')
  t.is(decoded.writerShort, 'a7f2')
  t.is(decoded.seq, 412)
})

test('decode: rejects malformed', (t) => {
  t.exception.all(() => entryId.decode('not-an-id'))
  t.exception.all(() => entryId.decode('a7f2-abc'))
  t.exception.all(() => entryId.decode('a7f2'))
  t.exception.all(() => entryId.decode(''))
})

test('isValid', (t) => {
  t.ok(entryId.isValid('a7f2-0'))
  t.ok(entryId.isValid('0000-9999999'))
  t.absent(entryId.isValid('A7F2-0'))
  t.absent(entryId.isValid('a7f2-'))
  t.absent(entryId.isValid('xxxx-0'))
})

test('property: encode/decode round-trips for any valid input', (t) => {
  fc.assert(
    fc.property(fc.uint8Array({ minLength: 4, maxLength: 32 }), fc.nat(1_000_000), (bytes, seq) => {
      const id = entryId.encode({ writerKey: Buffer.from(bytes), seq })
      const decoded = entryId.decode(id)
      return (
        decoded.writerShort === Buffer.from(bytes).toString('hex').slice(0, 4) &&
        decoded.seq === seq
      )
    }),
  )
  t.pass('property holds')
})
