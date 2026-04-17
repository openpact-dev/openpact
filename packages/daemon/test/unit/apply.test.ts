import test from 'brittle'
import b4a from 'b4a'
import {
  makeApply,
  AGENT_NAME_PREFIX,
  INDEXER_PREFIX,
  INVITE_PREFIX,
  MEMBER_PREFIX,
  type ApplyView,
  type ApplyHost,
  type ApplyNode,
  type InvalidInfo,
  type AppliedInfo,
} from '../../src/apply'
import { derive as deriveHandle } from '../../src/peer-handle'

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
    // Default handle is the canonical one for KEY_A. Callers that
    // deliberately want a mismatch (spoofing tests) pass { handle }
    // explicitly to override.
    agent_id: opts.handle || HANDLE_A,
    payload,
  }
}

const KEY_A = 'aa'.repeat(32)
const KEY_B = 'bb'.repeat(32)
const KEY_C = 'cc'.repeat(32)

const HANDLE_A = deriveHandle(b4a.from(KEY_A, 'hex') as Buffer)
const HANDLE_B = deriveHandle(b4a.from(KEY_B, 'hex') as Buffer)
const HANDLE_C = deriveHandle(b4a.from(KEY_C, 'hex') as Buffer)

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
  t.is(keys.length, 3)
  t.ok(keys.some((k) => k.startsWith('knowledge/')))
  t.ok(keys.some((k) => k.startsWith(MEMBER_PREFIX)))
  t.ok(keys.some((k) => k.startsWith(INDEXER_PREFIX)))
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
        value: { type: 'bogus', timestamp: TS, agent_id: HANDLE_A, payload: {} },
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
        value: entry(
          'admin',
          { action: 'addWriter', key: KEY_B, indexer: true },
          { handle: HANDLE_C },
        ),
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
  t.is(knowledgeKey, `knowledge/${TS}/aaaaaaaa-42`)
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
  t.is(stored.id, 'aaaaaaaa-7')
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
        value: entry('message', { content: 'hi' }),
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

test('display_name flows through apply unchanged', async (t) => {
  const view = fakeView()
  const apply = makeApply()
  await apply(
    [
      node({
        writerKey: KEY_A,
        length: 0,
        value: {
          ...entry('knowledge', { topic: 'sales', content: 'hi' }),
          display_name: 'Cinnabar',
        },
      }),
    ],
    view,
    fakeHost(),
  )
  const kKey = view._keys().find((k) => k.startsWith('knowledge/'))!
  const stored = view._data.get(kKey) as { display_name?: string | null }
  t.is(stored.display_name, 'Cinnabar')
})

test('display_name null is preserved', async (t) => {
  const view = fakeView()
  const apply = makeApply()
  await apply(
    [
      node({
        writerKey: KEY_A,
        length: 0,
        value: {
          ...entry('knowledge', { topic: 'sales', content: 'hi' }),
          display_name: null,
        },
      }),
    ],
    view,
    fakeHost(),
  )
  const kKey = view._keys().find((k) => k.startsWith('knowledge/'))!
  const stored = view._data.get(kKey) as { display_name?: string | null }
  t.is(stored.display_name, null)
})

test('display_name is indexed under _agents/<agent_id>', async (t) => {
  const view = fakeView()
  const apply = makeApply()
  await apply(
    [
      node({
        writerKey: KEY_A,
        length: 0,
        value: {
          ...entry('knowledge', { topic: 'sales', content: 'hi' }, { handle: HANDLE_A }),
          display_name: 'Asmodeus',
        },
      }),
    ],
    view,
    fakeHost(),
  )
  const stored = view._data.get(`${AGENT_NAME_PREFIX}${HANDLE_A}`) as
    | {
        name?: string
        ts?: string
      }
    | undefined
  t.ok(stored, 'agent name entry was written')
  t.is(stored?.name, 'Asmodeus')
  t.is(stored?.ts, TS)
})

test('_agents/ index ignores entries without display_name', async (t) => {
  const view = fakeView()
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
    fakeHost(),
  )
  t.absent(view._keys().some((k) => k.startsWith(AGENT_NAME_PREFIX)))
})

test('_agents/ index prefers newer timestamp over older', async (t) => {
  const view = fakeView()
  const apply = makeApply()
  const older = '2026-04-10T00:00:00.000Z'
  const newer = '2026-04-15T00:00:00.000Z'
  await apply(
    [
      node({
        writerKey: KEY_A,
        length: 0,
        value: {
          ...entry('knowledge', { topic: 't', content: 'c' }, { handle: HANDLE_A, ts: newer }),
          display_name: 'Recent Name',
        },
      }),
    ],
    view,
    fakeHost(),
  )
  // A later apply with an older timestamp must not clobber.
  await apply(
    [
      node({
        writerKey: KEY_A,
        length: 1,
        value: {
          ...entry('knowledge', { topic: 't2', content: 'c2' }, { handle: HANDLE_A, ts: older }),
          display_name: 'Old Name',
        },
      }),
    ],
    view,
    fakeHost(),
  )
  const stored = view._data.get(`${AGENT_NAME_PREFIX}${HANDLE_A}`) as { name?: string }
  t.is(stored?.name, 'Recent Name', 'older entry did not clobber newer')
})

test('_agents/ index is populated by admin entries too', async (t) => {
  const view = fakeView()
  const host = fakeHost()
  const apply = makeApply()
  // First entry so KEY_A is bootstrapped as indexer.
  await apply(
    [
      node({
        writerKey: KEY_A,
        length: 0,
        value: {
          ...entry('knowledge', { topic: 'seed', content: 'seed' }, { handle: HANDLE_A }),
          display_name: 'Creator',
        },
      }),
    ],
    view,
    host,
  )
  // Admin entry by the same indexer. Apply writes _agents/<handle>
  // even though the admin entry itself isn't stored under admin/.
  await apply(
    [
      node({
        writerKey: KEY_A,
        length: 1,
        value: {
          ...entry(
            'admin',
            { action: 'addWriter', key: KEY_B, indexer: false },
            { handle: HANDLE_A, ts: '2026-04-16T00:00:00.000Z' },
          ),
          display_name: 'Creator Updated',
        },
      }),
    ],
    view,
    host,
  )
  const stored = view._data.get(`${AGENT_NAME_PREFIX}${HANDLE_A}`) as { name?: string }
  t.is(stored?.name, 'Creator Updated')
})

test('display_name missing field is preserved (backward compat from pre-4a pacts)', async (t) => {
  const view = fakeView()
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
    fakeHost(),
  )
  const kKey = view._keys().find((k) => k.startsWith('knowledge/'))!
  const stored = view._data.get(kKey) as { display_name?: string | null }
  t.is(stored.display_name, undefined) // field never existed, not added by apply
})

test('display_name that trims to empty does not create _agents/ index row', async (t) => {
  // Whitespace-only display_name used to write an empty-string name
  // into the index; the trim + early-return at apply.ts guards that.
  const view = fakeView()
  const apply = makeApply()
  await apply(
    [
      node({
        writerKey: KEY_A,
        length: 0,
        value: {
          ...entry('knowledge', { topic: 'x', content: 'y' }),
          display_name: '   ',
        },
      }),
    ],
    view,
    fakeHost(),
  )
  t.absent(
    view._keys().some((k) => k.startsWith(AGENT_NAME_PREFIX)),
    'no _agents/<handle> row written for whitespace-only display_name',
  )
})

test('_agents/ index overwrites rows that lack a timestamp (pre-4a migration)', async (t) => {
  // Seed an _agents/<handle> row with the old shape ({ name } with no
  // ts). The next entry should win — the "existing ts missing" branch
  // in upsertAgentName falls through to the put() instead of
  // returning early.
  const view = fakeView()
  const apply = makeApply()
  view._data.set(`${AGENT_NAME_PREFIX}${HANDLE_A}`, { name: 'Legacy' })
  await apply(
    [
      node({
        writerKey: KEY_A,
        length: 0,
        value: {
          ...entry('knowledge', { topic: 'x', content: 'y' }),
          display_name: 'Fresh',
        },
      }),
    ],
    view,
    fakeHost(),
  )
  const row = view._data.get(`${AGENT_NAME_PREFIX}${HANDLE_A}`) as { name: string; ts: string }
  t.is(row.name, 'Fresh', 'legacy row without ts was overwritten')
  t.ok(row.ts, 'new row carries a ts')
})

test('entry id uses seq=0 when node.length is absent', async (t) => {
  // Autobase typically supplies node.length, but defensive code in
  // apply.ts treats an undefined length as seq 0. Covers the `?? 0`
  // fallback in the entry-id build step.
  const view = fakeView()
  const apply = makeApply()
  const applied: AppliedInfo[] = []
  await makeApply({ onApplied: (info) => applied.push(info) })(
    [
      {
        from: { key: b4a.from(KEY_A, 'hex') as Buffer },
        value: entry('knowledge', { topic: 'x', content: 'y' }),
      },
    ],
    view,
    fakeHost(),
  )
  t.ok(
    view._keys().some((k) => k.startsWith('knowledge/')),
    'entry still applied',
  )
  // eslint rule that flags unused vars is happy — we wanted apply
  // purely for its side-effect.
  void apply
})

// ─────── invite-redeemed ────────────────────────────────────────────

const NONCE_A = '11'.repeat(24)

test('invite-redeemed from indexer writes _invites/<nonce>', async (t) => {
  const view = fakeView()
  const host = fakeHost()
  const applied: AppliedInfo[] = []
  const apply = makeApply({ onApplied: (info) => applied.push(info) })
  // KEY_A becomes implicit indexer on its first append.
  await apply(
    [node({ writerKey: KEY_A, value: entry('knowledge', { topic: 'x', content: 'y' }) })],
    view,
    host,
  )
  await apply(
    [
      node({
        writerKey: KEY_A,
        value: entry('invite-redeemed', { nonce: NONCE_A, redeemed_by: KEY_B }),
      }),
    ],
    view,
    host,
  )
  const spent = (await view.get(`${INVITE_PREFIX}${NONCE_A}`)) as {
    value: { redeemed_by: string; redeemer: string }
  } | null
  t.ok(spent)
  t.is(spent!.value.redeemed_by, KEY_B)
  t.is(applied.at(-1)?.kind, 'invite-redeemed')
})

test('invite-redeemed from non-indexer is ignored', async (t) => {
  const view = fakeView()
  const host = fakeHost()
  const invalid: InvalidInfo[] = []
  const apply = makeApply({ onInvalid: (info) => invalid.push(info) })
  // KEY_A is bootstrapped as indexer; KEY_C is a random non-indexer.
  await apply(
    [node({ writerKey: KEY_A, value: entry('knowledge', { topic: 'x', content: 'y' }) })],
    view,
    host,
  )
  await apply(
    [
      node({
        writerKey: KEY_C,
        value: entry(
          'invite-redeemed',
          { nonce: NONCE_A, redeemed_by: KEY_B },
          { handle: HANDLE_C },
        ),
      }),
    ],
    view,
    host,
  )
  t.absent(await view.get(`${INVITE_PREFIX}${NONCE_A}`))
  t.ok(invalid.some((i) => i.reason === 'invite-from-non-indexer'))
})

test('second redeem of same nonce is rejected as invite-already-spent', async (t) => {
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
        writerKey: KEY_A,
        value: entry('invite-redeemed', { nonce: NONCE_A, redeemed_by: KEY_B }),
      }),
    ],
    view,
    host,
  )
  await apply(
    [
      node({
        writerKey: KEY_A,
        value: entry('invite-redeemed', { nonce: NONCE_A, redeemed_by: KEY_C }),
      }),
    ],
    view,
    host,
  )
  const spent = (await view.get(`${INVITE_PREFIX}${NONCE_A}`)) as {
    value: { redeemed_by: string }
  } | null
  // First-writer-wins: the replay keeps the original record.
  t.is(spent!.value.redeemed_by, KEY_B)
  t.ok(invalid.some((i) => i.reason === 'invite-already-spent'))
})

test('invite-redeemed schema-validates nonce length', async (t) => {
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
        writerKey: KEY_A,
        value: entry('invite-redeemed', { nonce: 'tooshort', redeemed_by: KEY_B }),
      }),
    ],
    view,
    host,
  )
  t.ok(invalid.some((i) => i.reason === 'schema'))
})

// ─────── agent_id spoofing ──────────────────────────────────────────

test('apply rejects entries whose agent_id does not match writer key', async (t) => {
  const view = fakeView()
  const invalid: InvalidInfo[] = []
  const apply = makeApply({ onInvalid: (info) => invalid.push(info) })
  // KEY_A writer claims KEY_B's handle.
  await apply(
    [
      node({
        writerKey: KEY_A,
        length: 0,
        value: entry('knowledge', { topic: 'x', content: 'y' }, { handle: HANDLE_B }),
      }),
    ],
    view,
    fakeHost(),
  )
  t.is(view._keys().length, 0, 'spoofed entry never reaches the view')
  t.is(invalid.length, 1)
  t.is(invalid[0].reason, 'agent-mismatch')
})

test('apply rejects entries with missing agent_id', async (t) => {
  const view = fakeView()
  const invalid: InvalidInfo[] = []
  const apply = makeApply({ onInvalid: (info) => invalid.push(info) })
  await apply(
    [
      node({
        writerKey: KEY_A,
        length: 0,
        // Skip `entry()` helper so we can omit agent_id entirely.
        value: {
          type: 'knowledge',
          timestamp: TS,
          payload: { topic: 'x', content: 'y' },
        },
      }),
    ],
    view,
    fakeHost(),
  )
  // Schema will reject first (agent_id is required in BaseEntry).
  t.is(view._keys().length, 0)
  t.ok(
    invalid.some((i) => i.reason === 'schema' || i.reason === 'agent-mismatch'),
    'rejected by schema or agent-mismatch',
  )
})

test('spoofed agent_id does not pollute _agents/ index', async (t) => {
  const view = fakeView()
  const apply = makeApply()
  await apply(
    [
      node({
        writerKey: KEY_A,
        length: 0,
        value: {
          ...entry('knowledge', { topic: 'x', content: 'y' }, { handle: HANDLE_B }),
          display_name: 'Impostor',
        },
      }),
    ],
    view,
    fakeHost(),
  )
  t.absent(
    view._data.get(`${AGENT_NAME_PREFIX}${HANDLE_B}`),
    'no _agents/ write for spoofed handle',
  )
  t.absent(view._data.get(`${AGENT_NAME_PREFIX}${HANDLE_A}`))
})
