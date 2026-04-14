import test from 'brittle'
import { formatStatus, formatPeers, formatLogLine, formatError } from '../../src/lib/format'

// Strip ANSI escapes so snapshot-style assertions don't depend on TTY state.
function strip(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '')
}

test('formatStatus: includes all fields', (t) => {
  const out = strip(
    formatStatus({
      pact_id: 'deadbeefcafebabe',
      peer_handle: 'anon-krait-7f2d',
      role: 'creator',
      public_key: 'abcdef',
      peers: 2,
      entries: 14,
      is_writer: true,
      is_indexer: true,
      synced: true,
    }),
  )
  t.ok(out.includes('Pact:'))
  t.ok(out.includes('deadbeefcafe'))
  t.ok(out.includes('anon-krait-7f2d'))
  t.ok(out.includes('creator'))
  t.ok(out.includes('Peers:'))
  t.ok(out.includes('2 online'))
  t.ok(out.includes('Entries:'))
  t.ok(out.includes('14'))
})

test('formatStatus: handles uninitialised state', (t) => {
  const out = strip(
    formatStatus({
      pact_id: null,
      peer_handle: null,
      role: null,
      public_key: null,
      peers: 0,
      entries: 0,
      is_writer: false,
      is_indexer: false,
      synced: false,
    }),
  )
  t.ok(out.includes('not initialised'))
})

test('formatPeers: empty list', (t) => {
  t.ok(strip(formatPeers([])).includes('no peers connected'))
})

test('formatPeers: tabular rows', (t) => {
  const out = strip(
    formatPeers([
      { id: 'anon-krait-7f2d', remote_key: 'abcdef0123456789', online: true },
      { id: 'anon-cobra-3e91', remote_key: 'fedcba9876543210', online: false },
    ]),
  )
  t.ok(out.includes('HANDLE'))
  t.ok(out.includes('anon-krait-7f2d'))
  t.ok(out.includes('online'))
  t.ok(out.includes('offline'))
})

test('formatLogLine: knowledge', (t) => {
  const out = strip(
    formatLogLine({
      type: 'knowledge',
      timestamp: '2026-04-14T10:00:00.000Z',
      agent_id: 'anon-krait-7f2d',
      payload: { topic: 'sales', content: 'Tuesdays convert' },
      id: 'aaaa-1',
    }),
  )
  t.ok(out.includes('[knowledge]'))
  t.ok(out.includes('topic=sales'))
  t.ok(out.includes('Tuesdays convert'))
})

test('formatLogLine: task', (t) => {
  const out = strip(
    formatLogLine({
      type: 'task',
      timestamp: '2026-04-14T10:00:00.000Z',
      agent_id: 'anon-krait-7f2d',
      payload: { title: 'Build it', status: 'claimed', claimed_by: 'anon-cobra-3e91' },
      id: 'aaaa-2',
    }),
  )
  t.ok(out.includes('[task]'))
  t.ok(out.includes('Build it'))
  t.ok(out.includes('[claimed by anon-cobra-3e91]'))
})

test('formatLogLine: skill', (t) => {
  const out = strip(
    formatLogLine({
      type: 'skill',
      timestamp: '2026-04-14T10:00:00.000Z',
      agent_id: 'anon-krait-7f2d',
      payload: { name: 'scraper', version: '1.0.0', format: 'openclaw' },
      id: 'aaaa-3',
    }),
  )
  t.ok(out.includes('scraper@1.0.0'))
  t.ok(out.includes('(openclaw)'))
})

test('formatLogLine: message', (t) => {
  const out = strip(
    formatLogLine({
      type: 'message',
      timestamp: '2026-04-14T10:00:00.000Z',
      agent_id: 'anon-krait-7f2d',
      payload: { to: '*', content: 'hello' },
      id: 'aaaa-4',
    }),
  )
  t.ok(out.includes('to *: hello'))
})

test('formatLogLine: long content truncated', (t) => {
  const out = strip(
    formatLogLine({
      type: 'knowledge',
      timestamp: '2026-04-14T10:00:00.000Z',
      agent_id: 'anon-krait-7f2d',
      payload: { topic: 'x', content: 'a'.repeat(200) },
    }),
  )
  t.ok(out.includes('…'))
})

test('formatError', (t) => {
  t.ok(strip(formatError('boom')).includes('error: boom'))
})
