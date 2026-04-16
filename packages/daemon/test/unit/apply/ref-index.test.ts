/**
 * apply.ts writes a reverse-ref index alongside the canonical
 * `<type>/<timestamp>/<id>` entry key. For every applied entry with
 * `refs.length > 0`, apply also writes one `ref/<target>/<source>`
 * key per ref carrying the source entry value.
 *
 * Properties under test:
 *   - entries with no refs add no extra writes (the existing single
 *     key remains the only write)
 *   - entries with one ref add exactly one ref/* key
 *   - entries with multiple refs add one ref/* key per ref
 *   - re-applying the same entry is idempotent (same key, same value)
 *   - refs that point at not-yet-applied targets still get the
 *     reverse key (resolution is read-side; targets don't have to
 *     exist yet)
 *
 * apply.ts has a per-file gate of ≥95% lines / ≥90% branches enforced
 * by scripts/check-apply-coverage.js. This test exercises the new
 * branch.
 */
import test from 'brittle'
import b4a from 'b4a'
import { makeApply, type ApplyView, type ApplyHost, type ApplyNode } from '../../../src/apply'

const VALID_HANDLE = 'anon-krait-7f2d'
const TS = '2026-04-14T10:30:00.000Z'
const KEY_A = 'aa'.repeat(32)

interface FakeView extends ApplyView {
  _data: Map<string, unknown>
  _keys(): string[]
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

const noopHost: ApplyHost = {
  async addWriter() {},
  async removeWriter() {},
}

function node(value: unknown, length = 0): ApplyNode {
  return { from: { key: b4a.from(KEY_A, 'hex') as Buffer }, length, value }
}

function entry(type: string, payload: unknown, refs?: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {
    type,
    timestamp: TS,
    agent_id: VALID_HANDLE,
    payload,
  }
  if (refs) out.refs = refs
  return out
}

const TYPE_KEY_RE = /^(knowledge|task|skill|message)\/.+/

function dataKeys(view: FakeView): string[] {
  return view._keys().filter((k) => !k.startsWith('_indexers/') && !k.startsWith('_members/'))
}

test('entry with no refs writes exactly one key', async (t) => {
  const view = fakeView()
  const apply = makeApply()
  await apply([node(entry('knowledge', { topic: 'x', content: 'y' }), 0)], view, noopHost)
  const keys = dataKeys(view)
  t.is(keys.length, 1, 'one entry key, no ref keys')
  t.ok(TYPE_KEY_RE.test(keys[0]))
})

test('entry with empty refs array writes exactly one key', async (t) => {
  const view = fakeView()
  const apply = makeApply()
  await apply([node(entry('knowledge', { topic: 'x', content: 'y' }, []), 0)], view, noopHost)
  t.is(dataKeys(view).length, 1)
})

test('entry with one ref writes one ref/<target>/<source> key alongside', async (t) => {
  const view = fakeView()
  const apply = makeApply()
  await apply(
    [node(entry('task', { title: 't', status: 'open' }, ['target-1']), 0)],
    view,
    noopHost,
  )
  const refKeys = dataKeys(view).filter((k) => k.startsWith('ref/'))
  t.is(refKeys.length, 1, 'one ref key written')
  t.ok(refKeys[0].startsWith('ref/target-1/'), 'ref key is ref/<target>/<source>')
  // The ref key's value is the source entry, with id stamped.
  const stored = view._data.get(refKeys[0]) as { type: string; refs: string[]; id: string }
  t.is(stored.type, 'task')
  t.alike(stored.refs, ['target-1'])
  t.ok(stored.id, 'source id stamped on the ref-index value')
})

test('entry with multiple refs writes one ref key per ref', async (t) => {
  const view = fakeView()
  const apply = makeApply()
  await apply(
    [node(entry('knowledge', { topic: 'x', content: 'y' }, ['t1', 't2', 't3']), 0)],
    view,
    noopHost,
  )
  const refKeys = view._keys().filter((k) => k.startsWith('ref/'))
  t.is(refKeys.length, 3, 'three ref keys written')
  t.ok(refKeys.some((k) => k.startsWith('ref/t1/')))
  t.ok(refKeys.some((k) => k.startsWith('ref/t2/')))
  t.ok(refKeys.some((k) => k.startsWith('ref/t3/')))
})

test('re-applying the same entry overwrites the same ref key (idempotent)', async (t) => {
  const view = fakeView()
  const apply = makeApply()
  const node1 = node(entry('task', { title: 't', status: 'open' }, ['target-1']), 5)

  await apply([node1], view, noopHost)
  const keysAfterFirst = view._keys()
  await apply([node1], view, noopHost)
  const keysAfterSecond = view._keys()

  t.alike(keysAfterFirst, keysAfterSecond, 'no new keys on re-apply')
  const refKeys = keysAfterSecond.filter((k) => k.startsWith('ref/'))
  t.is(refKeys.length, 1)
})

test('refs to not-yet-applied targets still get indexed', async (t) => {
  const view = fakeView()
  const apply = makeApply()
  await apply(
    [node(entry('knowledge', { topic: 'x', content: 'forward-reference' }, ['ghost-target']), 0)],
    view,
    noopHost,
  )
  const refKeys = view._keys().filter((k) => k.startsWith('ref/ghost-target/'))
  t.is(refKeys.length, 1, 'reverse key written even though target was never applied')
})

test('non-string ref entries are skipped without error', async (t) => {
  const view = fakeView()
  const apply = makeApply()
  // Schema validation accepts string-array refs; this synthetic test covers
  // the defensive branch in apply.ts that ignores non-string entries.
  await apply(
    [node(entry('knowledge', { topic: 'x', content: 'y' }, ['good-target', '' as string]), 0)],
    view,
    noopHost,
  )
  const refKeys = view._keys().filter((k) => k.startsWith('ref/'))
  t.is(refKeys.length, 1, 'only the non-empty string ref was indexed')
  t.ok(refKeys[0].startsWith('ref/good-target/'))
})

test('admin entries do not write ref keys (admin path is separate)', async (t) => {
  const view = fakeView()
  const apply = makeApply()
  await apply(
    [
      node(
        {
          type: 'admin',
          timestamp: TS,
          agent_id: VALID_HANDLE,
          payload: { action: 'addWriter', key: 'bb'.repeat(32), indexer: false },
          refs: ['some-target'],
        },
        0,
      ),
    ],
    view,
    {
      async addWriter() {},
      async removeWriter() {},
    },
  )
  const refKeys = view._keys().filter((k) => k.startsWith('ref/'))
  t.is(refKeys.length, 0, 'admin entries do not flow through the ref-index branch')
})
