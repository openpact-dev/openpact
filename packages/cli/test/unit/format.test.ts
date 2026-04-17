import test from 'brittle'
import {
  formatHostStatus,
  formatStatus,
  formatAgents,
  formatLogLine,
  formatError,
} from '../../src/lib/format'

// Strip ANSI escapes so snapshot-style assertions don't depend on TTY state.
function strip(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '')
}

test('formatStatus: includes all fields', (t) => {
  const out = strip(
    formatStatus({
      pact_id: 'deadbeefcafebabe',
      peer_handle: 'anon-krait-7f2d9999',
      role: 'creator',
      public_key: 'abcdef',
      agents: 2,
      entries: 14,
      is_member: true,
      is_indexer: true,
      synced: true,
    }),
  )
  t.ok(out.includes('Pact'))
  t.ok(out.includes('deadbeefcafe'))
  t.ok(out.includes('anon-krait-7f2d9999'))
  t.ok(out.includes('creator'))
  t.ok(out.includes('Agents'))
  t.ok(out.includes('2'))
  t.ok(out.includes('Entries'))
  t.ok(out.includes('14'))
  t.ok(out.includes('OpenPact'), 'wordmark in header')
})

test('formatStatus: renders pact name, purpose, display name, and context', (t) => {
  const out = strip(
    formatStatus(
      {
        pact_id: 'deadbeefcafebabe',
        pact_name: 'QuiteRight',
        pact_purpose: 'Co-ordinate QR Agent Outreach',
        peer_handle: 'anon-krait-7f2d9999',
        display_name: 'Henry',
        role: 'creator',
        public_key: 'abcdef',
        agents: 2,
        entries: 14,
        is_member: true,
        is_indexer: true,
        synced: true,
      },
      {
        alias: 'quiteright',
        totalPacts: 3,
        currentAlias: 'quiteright',
        apiPort: 7666,
        dashboardPort: 7667,
        dataDir: '/tmp/op-solo',
        pid: 4242,
      },
    ),
  )
  t.ok(out.includes('QuiteRight'), 'pact name shown')
  t.ok(out.includes('Co-ordinate QR Agent Outreach'), 'purpose shown')
  t.ok(out.includes('Henry'), 'display name shown')
  t.ok(out.includes('anon-krait-7f2d9999'), 'handle shown alongside display name')
  t.ok(out.includes('quiteright'), 'alias shown')
  t.ok(out.includes('(current)'), 'marks alias as current when it matches')
  t.ok(out.includes('3 pacts on this host'), 'total pact count')
  t.ok(out.includes('/v1/pacts/quiteright/*'), 'REST base path')
  t.ok(out.includes('http://127.0.0.1:7667'), 'dashboard url')
  t.ok(out.includes('4242'), 'pid shown')
  t.ok(out.includes('/tmp/op-solo'), 'data dir')
})

test('formatHostStatus: renders daemon details when no pact exists', (t) => {
  const out = strip(
    formatHostStatus(
      {
        current: null,
        agents: 0,
        pact_count: 0,
      },
      {
        totalPacts: 0,
        currentAlias: null,
        apiPort: 7666,
        dashboardPort: 7667,
        dataDir: '/tmp/op-empty',
        pid: 31337,
      },
    ),
  )

  t.ok(out.includes('Daemon is running'))
  t.ok(out.includes('0'))
  t.ok(out.includes('No pacts yet'))
  t.ok(out.includes('http://127.0.0.1:7666/v1/*'))
  t.ok(out.includes('http://127.0.0.1:7667'))
  t.ok(out.includes('31337'))
  t.ok(out.includes('/tmp/op-empty'))
})

test('formatStatus: handles uninitialised state', (t) => {
  const out = strip(
    formatStatus({
      pact_id: null,
      peer_handle: null,
      role: null,
      public_key: null,
      agents: 0,
      entries: 0,
      is_member: false,
      is_indexer: false,
      synced: false,
    }),
  )
  t.ok(out.includes('—'), 'em-dash placeholder for missing values')
})

test('formatAgents: empty list', (t) => {
  t.ok(strip(formatAgents([])).includes('No agents bound'))
})

test('formatAgents: tabular rows', (t) => {
  const out = strip(
    formatAgents([
      { id: 'anon-krait-7f2d9999', remote_key: 'abcdef0123456789', online: true },
      { id: 'anon-cobra-3e910000', remote_key: 'fedcba9876543210', online: false },
    ]),
  )
  t.ok(out.includes('HANDLE'))
  t.ok(out.includes('anon-krait-7f2d9999'))
  t.ok(out.includes('online'))
  t.ok(out.includes('offline'))
})

test('formatLogLine: knowledge', (t) => {
  const out = strip(
    formatLogLine({
      type: 'knowledge',
      timestamp: '2026-04-14T10:00:00.000Z',
      agent_id: 'anon-krait-7f2d9999',
      payload: { topic: 'sales', content: 'Tuesdays convert' },
      id: 'aaaaaaaa-1',
    }),
  )
  t.ok(out.includes('knowledge'), 'type label present')
  t.ok(out.includes('topic=sales'))
  t.ok(out.includes('Tuesdays convert'))
})

test('formatLogLine: task', (t) => {
  const out = strip(
    formatLogLine({
      type: 'task',
      timestamp: '2026-04-14T10:00:00.000Z',
      agent_id: 'anon-krait-7f2d9999',
      payload: { title: 'Build it', status: 'claimed', claimed_by: 'anon-cobra-3e910000' },
      id: 'aaaaaaaa-2',
    }),
  )
  t.ok(out.includes('task'))
  t.ok(out.includes('Build it'))
  t.ok(out.includes('claimed by anon-cobra-3e910000'))
})

test('formatLogLine: skill', (t) => {
  const out = strip(
    formatLogLine({
      type: 'skill',
      timestamp: '2026-04-14T10:00:00.000Z',
      agent_id: 'anon-krait-7f2d9999',
      payload: { name: 'scraper', version: '1.0.0', format: 'openclaw' },
      id: 'aaaaaaaa-3',
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
      agent_id: 'anon-krait-7f2d9999',
      // Messages are pact-wide broadcasts; the misleading `to` field
      // was dropped in 35c8faa. The log line just shows the content.
      payload: { content: 'hello' },
      id: 'aaaaaaaa-4',
    }),
  )
  t.ok(out.includes('hello'))
  t.absent(out.includes(' to '), 'stale "to" label is gone')
})

test('formatLogLine: long content truncated', (t) => {
  const out = strip(
    formatLogLine({
      type: 'knowledge',
      timestamp: '2026-04-14T10:00:00.000Z',
      agent_id: 'anon-krait-7f2d9999',
      payload: { topic: 'x', content: 'a'.repeat(200) },
    }),
  )
  t.ok(out.includes('…'))
})

test('formatError', (t) => {
  t.ok(strip(formatError('boom')).includes('boom'))
  t.ok(strip(formatError('boom')).includes('❌'))
})
