import test from 'brittle'
import { validate, MAX_PAYLOAD_BYTES } from '../../src/schemas'

const validHandle = 'anon-krait-7f2d9999'
const ts = '2026-04-14T10:30:00.000Z'

function base(type: string, payload: unknown): Record<string, unknown> {
  return { type, timestamp: ts, agent_id: validHandle, payload }
}

test('knowledge: valid entry passes', (t) => {
  const r = validate(base('knowledge', { topic: 'sales', content: 'hello' }))
  t.is(r.valid, true)
})

test('knowledge: missing topic rejects', (t) => {
  const r = validate(base('knowledge', { content: 'hello' }))
  t.is(r.valid, false)
  if (!r.valid) t.is(r.reason, 'schema')
})

test('knowledge: missing content rejects', (t) => {
  const r = validate(base('knowledge', { topic: 'sales' }))
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
  const r = validate(base('message', { content: 'heads up' }))
  t.is(r.valid, true)
})

test('message: empty content rejects', (t) => {
  const r = validate(base('message', { content: '' }))
  t.is(r.valid, false)
})

test('message: rejects unknown fields (no per-recipient addressing)', (t) => {
  // The `to` field used to be addressed-but-not-private. It's gone now;
  // the schema rejects it so callers can't accidentally rely on it.
  const r = validate(base('message', { to: '*', content: 'hi' }))
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
  const e = base('knowledge', { topic: 'x', content: 'y' }) as any
  e.agent_id = 'james'
  t.is(validate(e).valid, false)
})

test('common: malformed timestamp rejects', (t) => {
  const e = base('knowledge', { topic: 'x', content: 'y' }) as any
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
  if (!r.valid) t.is(r.reason, 'unknown-type')
})

test('common: null entry rejects', (t) => {
  const r = validate(null)
  t.is(r.valid, false)
  if (!r.valid) t.is(r.reason, 'not-an-object')
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
  if (!r.valid) t.is(r.reason, 'payload-too-large')
})

test('payload size: at-limit accepts', (t) => {
  const overhead = JSON.stringify({ topic: 'x', content: '' }).length
  const content = 'x'.repeat(MAX_PAYLOAD_BYTES - overhead)
  const r = validate(base('knowledge', { topic: 'x', content }))
  t.is(r.valid, true)
})

// display_name — advisory label on every entry type.
test('display_name: null is valid', (t) => {
  const e = { ...base('knowledge', { topic: 'x', content: 'y' }), display_name: null }
  t.is(validate(e).valid, true)
})

test('display_name: string is valid', (t) => {
  const e = { ...base('knowledge', { topic: 'x', content: 'y' }), display_name: 'Cinnabar' }
  t.is(validate(e).valid, true)
})

test('display_name: unicode accepted', (t) => {
  const e = { ...base('knowledge', { topic: 'x', content: 'y' }), display_name: '狐火 Bramble' }
  t.is(validate(e).valid, true)
})

test('display_name: over 64 chars rejects', (t) => {
  const e = {
    ...base('knowledge', { topic: 'x', content: 'y' }),
    display_name: 'a'.repeat(65),
  }
  t.is(validate(e).valid, false)
})

test('display_name: applies on every entry type', (t) => {
  t.is(
    validate({ ...base('task', { title: 'x', status: 'open' }), display_name: 'Wyrm' }).valid,
    true,
  )
  t.is(
    validate({
      ...base('skill', {
        name: 's',
        version: '1.0.0',
        format: 'generic',
        content: '...',
        checksum: 'sha256:' + 'a'.repeat(64),
      }),
      display_name: 'Wyrm',
    }).valid,
    true,
  )
  t.is(validate({ ...base('message', { content: 'hi' }), display_name: 'Wyrm' }).valid, true)
  t.is(
    validate({
      ...base('admin', { action: 'addWriter', key: 'a'.repeat(64), indexer: true }),
      display_name: 'Wyrm',
    }).valid,
    true,
  )
})

test('display_name: omitted field is valid (backward compat)', (t) => {
  // No display_name at all on the object — older entries replicated
  // from pre-4a pacts look like this. Must still pass.
  const r = validate(base('knowledge', { topic: 'x', content: 'y' }))
  t.is(r.valid, true)
})
