const test = require('brittle')
const { validate, MAX_PAYLOAD_BYTES } = require('../../src/schemas')

const validHandle = 'anon-krait-7f2d'
const ts = '2026-04-14T10:30:00.000Z'

function base(type, payload) {
  return { type, timestamp: ts, agent_id: validHandle, payload }
}

test('knowledge: valid entry passes', (t) => {
  const r = validate(base('knowledge', { topic: 'sales', content: 'hello' }))
  t.is(r.valid, true)
})

test('knowledge: missing topic rejects', (t) => {
  const r = validate(base('knowledge', { content: 'hello' }))
  t.is(r.valid, false)
  t.is(r.reason, 'schema')
})

test('knowledge: missing content rejects', (t) => {
  const r = validate(base('knowledge', { topic: 'sales' }))
  t.is(r.valid, false)
})

test('knowledge: confidence out of range rejects', (t) => {
  const r = validate(base('knowledge', { topic: 'sales', content: 'x', confidence: 1.5 }))
  t.is(r.valid, false)
})

test('task: valid open task passes', (t) => {
  const r = validate(base('task', { title: 'Build it', status: 'open' }))
  t.is(r.valid, true)
})

test('task: invalid status rejects', (t) => {
  const r = validate(base('task', { title: 'X', status: 'unknown' }))
  t.is(r.valid, false)
})

test('skill: valid entry passes', (t) => {
  const r = validate(
    base('skill', {
      name: 'scraper',
      version: '1.0.0',
      format: 'openclaw',
      content: '...',
      checksum: 'sha256:' + 'a'.repeat(64),
    }),
  )
  t.is(r.valid, true)
})

test('skill: malformed checksum rejects', (t) => {
  const r = validate(
    base('skill', {
      name: 'scraper',
      version: '1.0.0',
      format: 'openclaw',
      content: '...',
      checksum: 'md5:abc',
    }),
  )
  t.is(r.valid, false)
})

test('skill: unknown format rejects', (t) => {
  const r = validate(
    base('skill', {
      name: 'scraper',
      version: '1.0.0',
      format: 'autogen',
      content: '...',
      checksum: 'sha256:' + 'a'.repeat(64),
    }),
  )
  t.is(r.valid, false)
})

test('message: broadcast passes', (t) => {
  const r = validate(base('message', { to: '*', content: 'heads up' }))
  t.is(r.valid, true)
})

test('message: direct passes', (t) => {
  const r = validate(base('message', { to: 'anon-cobra-3e91', content: 'hi' }))
  t.is(r.valid, true)
})

test('message: invalid handle rejects', (t) => {
  const r = validate(base('message', { to: 'NotAHandle', content: 'hi' }))
  t.is(r.valid, false)
})

test('admin: addWriter passes', (t) => {
  const r = validate(base('admin', { action: 'addWriter', key: 'a'.repeat(64), indexer: true }))
  t.is(r.valid, true)
})

test('admin: malformed hex key rejects', (t) => {
  const r = validate(base('admin', { action: 'addWriter', key: 'short' }))
  t.is(r.valid, false)
})

test('admin: unknown action rejects', (t) => {
  const r = validate(base('admin', { action: 'demote', key: 'a'.repeat(64) }))
  t.is(r.valid, false)
})

test('common: missing timestamp rejects', (t) => {
  const e = { type: 'knowledge', agent_id: validHandle, payload: { topic: 'x', content: 'y' } }
  t.is(validate(e).valid, false)
})

test('common: bad agent_id pattern rejects', (t) => {
  const e = base('knowledge', { topic: 'x', content: 'y' })
  e.agent_id = 'james'
  t.is(validate(e).valid, false)
})

test('common: malformed timestamp rejects', (t) => {
  const e = base('knowledge', { topic: 'x', content: 'y' })
  e.timestamp = 'yesterday'
  t.is(validate(e).valid, false)
})

test('common: extra top-level fields rejected', (t) => {
  const e = { ...base('knowledge', { topic: 'x', content: 'y' }), extra: 'no' }
  t.is(validate(e).valid, false)
})

test('common: unknown type rejects with unknown-type reason', (t) => {
  const r = validate({ type: 'bogus', timestamp: ts, agent_id: validHandle, payload: {} })
  t.is(r.valid, false)
  t.is(r.reason, 'unknown-type')
})

test('common: null entry rejects', (t) => {
  const r = validate(null)
  t.is(r.valid, false)
  t.is(r.reason, 'not-an-object')
})

test('common: non-object rejects', (t) => {
  t.is(validate('hello').valid, false)
  t.is(validate(42).valid, false)
  t.is(validate(undefined).valid, false)
})

test('payload size: oversize rejects', (t) => {
  const big = 'x'.repeat(MAX_PAYLOAD_BYTES + 1)
  const r = validate(base('knowledge', { topic: 'x', content: big }))
  t.is(r.valid, false)
  t.is(r.reason, 'payload-too-large')
})

test('payload size: at-limit accepts', (t) => {
  // build payload that serializes to exactly MAX_PAYLOAD_BYTES
  const overhead = JSON.stringify({ topic: 'x', content: '' }).length
  const content = 'x'.repeat(MAX_PAYLOAD_BYTES - overhead)
  const r = validate(base('knowledge', { topic: 'x', content }))
  t.is(r.valid, true)
})
