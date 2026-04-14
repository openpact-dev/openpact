import test from 'brittle'
import b4a from 'b4a'
import {
  makeApply,
  INDEXER_PREFIX,
  type ApplyView,
  type ApplyHost,
  type ApplyNode,
  type InvalidInfo,
  type AppliedInfo,
} from '../../src/apply'

const VALID_HANDLE = 'anon-krait-7f2d'
const TS = '2026-04-14T10:30:00.000Z'

interface FakeView extends ApplyView {
  _data: Map<string, unknown>
  _keys(): string[]
}

interface FakeHost extends ApplyHost {
  _calls: Array<{ method: string; key: string; opts?: { indexer: boolean } }>
}

function fakeView(): FakeView {
  const data = new Map<string, unknown>()
  return {
    async get(key) {
      return data.has(key) ? { key, value: data.get(key) } : null
    },
    async put(key, value) {
      data.set(key, value)
    },
    async del(key) {
      data.delete(key)
    },
    async peek(range) {
      const keys = [...data.keys()].sort()
      for (const k of keys) {
        if (k >= range.gte && k < range.lt) return { key: k, value: data.get(k) }
      }
      return null
    },
    _data: data,
    _keys() {
      return [...data.keys()].sort()
    },
  }
}

function fakeHost(): FakeHost {
  const calls: FakeHost['_calls'] = []
  return {
    async addWriter(key, opts) {
      calls.push({ method: 'addWriter', key: b4a.toString(key, 'hex') as string, opts })
    },
    async removeWriter(key) {
      calls.push({ method: 'removeWriter', key: b4a.toString(key, 'hex') as string })
    },
    _calls: calls,
  }
}

function node({
  writerKey,
  length = 0,
  value,
}: {
  writerKey: string | Buffer
  length?: number
  value: unknown
}): ApplyNode {
  const keyBuf = typeof writerKey === 'string' ? (b4a.from(writerKey, 'hex') as Buffer) : writerKey
  return { from: { key: keyBuf }, length, value }
}

function entry(
  type: string,
  payload: unknown,
  opts: { ts?: string; handle?: string } = {},
): Record<string, unknown> {
  return {
    type,
    timestamp: opts.ts || TS,
    agent_id: opts.handle || VALID_HANDLE,
    payload,
  }
}

const KEY_A = 'aa'.repeat(32)
const KEY_B = 'bb'.repeat(32)
const KEY_C = 'cc'.repeat(32)

test('valid knowledge entry is appended to view', async (t) => {
  const view = fakeView()
  const apply = makeApply()
  await apply(
    [
      node({
        writerKey: KEY_A,
        length: 0,
        value: entry('knowledge', { topic: 'sales', content: 'hi' }),
      }),
    ],
    view,
    fakeHost(),
  )
  const keys = view._keys()
  t.is(keys.length, 2)
  t.ok(keys.some((k) => k.startsWith('knowledge/')))
})

test('apply tolerates non-object node.value (drop)', async (t) => {
  const view = fakeView()
  const invalid: InvalidInfo[] = []
  const apply = makeApply({ onInvalid: (info) => invalid.push(info) })
  await apply(
    [node({ writerKey: KEY_A, value: null }), node({ writerKey: KEY_A, value: 'string' })],
    view,
    fakeHost(),
  )
  t.is(view._keys().length, 0)
  t.is(invalid.length, 2)
  t.is(invalid[0].reason, 'not-an-object')
})

test('schema-invalid entries dropped with reason', async (t) => {
  const view = fakeView()
  const invalid: InvalidInfo[] = []
  const apply = makeApply({ onInvalid: (info) => invalid.push(info) })
  await apply(
    [node({ writerKey: KEY_A, value: entry('knowledge', { topic: 'x' }) })],
    view,
    fakeHost(),
  )
  t.is(view._keys().length, 0)
  t.is(invalid.length, 1)
  t.is(invalid[0].reason, 'schema')
})

test('unknown entry type dropped', async (t) => {
  const view = fakeView()
  const invalid: InvalidInfo[] = []
  const apply = makeApply({ onInvalid: (info) => invalid.push(info) })
  await apply(
    [
      node({
        writerKey: KEY_A,
        value: { type: 'bogus', timestamp: TS, agent_id: VALID_HANDLE, payload: {} },
      }),
    ],
    view,
    fakeHost(),
  )
  t.is(view._keys().length, 0)
  t.is(invalid[0].reason, 'unknown-type')
})

test('admin addWriter from indexer calls host.addWriter and updates view', async (t) => {
  const view = fakeView()
  const host = fakeHost()
  const apply = makeApply()
  await apply(
    [
      node({
        writerKey: KEY_A,
        length: 0,
        value: entry('knowledge', { topic: 'x', content: 'y' }),
      }),
    ],
    view,
    host,
  )
  await apply(
    [
      node({
        writerKey: KEY_A,
        length: 1,
        value: entry('admin', { action: 'addWriter', key: KEY_B, indexer: true }),
      }),
    ],
    view,
    host,
  )
  t.is(host._calls.length, 1)
  t.is(host._calls[0].method, 'addWriter')
  t.is(host._calls[0].key, KEY_B)
  t.is(host._calls[0].opts?.indexer, true)
  t.ok(await view.get(`${INDEXER_PREFIX}${KEY_B}`))
})

test('admin from non-indexer is ignored', async (t) => {
  const view = fakeView()
  const host = fakeHost()
  const invalid: InvalidInfo[] = []
  const apply = makeApply({ onInvalid: (info) => invalid.push(info) })
  await apply(
    [node({ writerKey: KEY_A, value: entry('knowledge', { topic: 'x', content: 'y' }) })],
    view,
    host,
  )
  await apply(
    [
      node({
        writerKey: KEY_C,
        value: entry('admin', { action: 'addWriter', key: KEY_B, indexer: true }),
      }),
    ],
    view,
    host,
  )
  t.is(host._calls.length, 0)
  t.is(invalid.length, 1)
  t.is(invalid[0].reason, 'admin-from-non-indexer')
  t.absent(await view.get(`${INDEXER_PREFIX}${KEY_B}`))
})

test('bootstrap: first writer becomes implicit creator-indexer', async (t) => {
  const view = fakeView()
  const apply = makeApply()
  await apply(
    [node({ writerKey: KEY_A, value: entry('knowledge', { topic: 'x', content: 'y' }) })],
    view,
    fakeHost(),
  )
  t.ok(await view.get(`${INDEXER_PREFIX}${KEY_A}`))
})

test('admin removeWriter from indexer calls host and removes from indexer set', async (t) => {
  const view = fakeView()
  const host = fakeHost()
  const apply = makeApply()
  await apply(
    [node({ writerKey: KEY_A, value: entry('knowledge', { topic: 'x', content: 'y' }) })],
    view,
    host,
  )
  await apply(
    [
      node({
        writerKey: KEY_A,
        value: entry('admin', { action: 'addWriter', key: KEY_B, indexer: true }),
      }),
    ],
    view,
    host,
  )
  await apply(
    [
      node({
        writerKey: KEY_A,
        value: entry('admin', { action: 'removeWriter', key: KEY_B }),
      }),
    ],
    view,
    host,
  )
  t.is(host._calls.length, 2)
  t.is(host._calls[1].method, 'removeWriter')
  t.is(host._calls[1].key, KEY_B)
  t.absent(await view.get(`${INDEXER_PREFIX}${KEY_B}`))
})

test('admin addWriter without indexer flag does not update indexer set', async (t) => {
  const view = fakeView()
  const host = fakeHost()
  const apply = makeApply()
  await apply(
    [node({ writerKey: KEY_A, value: entry('knowledge', { topic: 'x', content: 'y' }) })],
    view,
    host,
  )
  await apply(
    [
      node({
        writerKey: KEY_A,
        value: entry('admin', { action: 'addWriter', key: KEY_B, indexer: false }),
      }),
    ],
    view,
    host,
  )
  t.is(host._calls[0].opts?.indexer, false)
  t.absent(await view.get(`${INDEXER_PREFIX}${KEY_B}`))
})

test('admin entries do not appear in user-facing view (no admin/ prefix)', async (t) => {
  const view = fakeView()
  const apply = makeApply()
  await apply(
    [node({ writerKey: KEY_A, value: entry('knowledge', { topic: 'x', content: 'y' }) })],
    view,
    fakeHost(),
  )
  await apply(
    [
      node({
        writerKey: KEY_A,
        value: entry('admin', { action: 'addWriter', key: KEY_B, indexer: true }),
      }),
    ],
    view,
    fakeHost(),
  )
  const keys = view._keys()
  t.absent(keys.some((k) => k.startsWith('admin/')))
})

test('view key uses type/timestamp/id format', async (t) => {
  const view = fakeView()
  const apply = makeApply()
  await apply(
    [
      node({
        writerKey: KEY_A,
        length: 42,
        value: entry('knowledge', { topic: 'x', content: 'y' }),
      }),
    ],
    view,
    fakeHost(),
  )
  const knowledgeKey = view._keys().find((k) => k.startsWith('knowledge/'))
  t.is(knowledgeKey, `knowledge/${TS}/aaaa-42`)
})

test('stored entry includes derived id field', async (t) => {
  const view = fakeView()
  const apply = makeApply()
  await apply(
    [
      node({
        writerKey: KEY_A,
        length: 7,
        value: entry('knowledge', { topic: 'x', content: 'y' }),
      }),
    ],
    view,
    fakeHost(),
  )
  const knowledgeKey = view._keys().find((k) => k.startsWith('knowledge/'))!
  const stored = (await view.get(knowledgeKey))!.value as { id: string }
  t.is(stored.id, 'aaaa-7')
})

test('multiple nodes in one apply call processed in order', async (t) => {
  const view = fakeView()
  const apply = makeApply()
  await apply(
    [
      node({
        writerKey: KEY_A,
        length: 0,
        value: entry('knowledge', { topic: 'a', content: 'first' }),
      }),
      node({
        writerKey: KEY_A,
        length: 1,
        value: entry('knowledge', { topic: 'b', content: 'second' }),
      }),
      node({
        writerKey: KEY_A,
        length: 2,
        value: entry('knowledge', { topic: 'c', content: 'third' }),
      }),
    ],
    view,
    fakeHost(),
  )
  const knowledgeKeys = view._keys().filter((k) => k.startsWith('knowledge/'))
  t.is(knowledgeKeys.length, 3)
})

test('node missing from.key dropped', async (t) => {
  const view = fakeView()
  const invalid: InvalidInfo[] = []
  const apply = makeApply({ onInvalid: (i) => invalid.push(i) })
  await apply(
    [{ from: {}, length: 0, value: entry('knowledge', { topic: 'x', content: 'y' }) }],
    view,
    fakeHost(),
  )
  t.is(invalid[0].reason, 'no-writer-key')
})

test('payload too large dropped', async (t) => {
  const view = fakeView()
  const invalid: InvalidInfo[] = []
  const apply = makeApply({ onInvalid: (i) => invalid.push(i) })
  const big = 'x'.repeat(70 * 1024)
  await apply(
    [node({ writerKey: KEY_A, value: entry('knowledge', { topic: 'x', content: big }) })],
    view,
    fakeHost(),
  )
  t.is(invalid[0].reason, 'payload-too-large')
})

test('onApplied fires for both entries and admin', async (t) => {
  const view = fakeView()
  const applied: AppliedInfo[] = []
  const apply = makeApply({ onApplied: (i) => applied.push(i) })
  await apply(
    [node({ writerKey: KEY_A, value: entry('knowledge', { topic: 'x', content: 'y' }) })],
    view,
    fakeHost(),
  )
  await apply(
    [
      node({
        writerKey: KEY_A,
        value: entry('admin', { action: 'addWriter', key: KEY_B, indexer: true }),
      }),
    ],
    view,
    fakeHost(),
  )
  t.is(applied.length, 2)
  t.is(applied[0].kind, 'entry')
  t.is(applied[1].kind, 'admin')
})

test('all four user types append to view', async (t) => {
  const view = fakeView()
  const host = fakeHost()
  const apply = makeApply()
  await apply(
    [
      node({
        writerKey: KEY_A,
        length: 0,
        value: entry('knowledge', { topic: 'x', content: 'y' }),
      }),
      node({
        writerKey: KEY_A,
        length: 1,
        value: entry('task', { title: 't', status: 'open' }),
      }),
      node({
        writerKey: KEY_A,
        length: 2,
        value: entry('skill', {
          name: 's',
          version: '1.0.0',
          format: 'openclaw',
          content: '...',
          checksum: 'sha256:' + 'a'.repeat(64),
        }),
      }),
      node({
        writerKey: KEY_A,
        length: 3,
        value: entry('message', { to: '*', content: 'hi' }),
      }),
    ],
    view,
    host,
  )
  const keys = view._keys()
  t.ok(keys.some((k) => k.startsWith('knowledge/')))
  t.ok(keys.some((k) => k.startsWith('task/')))
  t.ok(keys.some((k) => k.startsWith('skill/')))
  t.ok(keys.some((k) => k.startsWith('message/')))
})
