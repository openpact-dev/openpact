import test from 'brittle'
import { _internals } from '../../src/commands/hook'
import type { OpenPact } from '@openpact/sdk'
import type {
  AgentPayload,
  KnowledgeEntry,
  ListPage,
  MessageEntry,
  StatusPayload,
  TaskState,
} from '@openpact/sdk'

const { buildSessionContext, buildPromptContext, handleLabel, shortTs, truncate } = _internals

// ─── Small helpers ──────────────────────────────────────────────────

test('shortTs: trims ISO to date + HH:MM', (t) => {
  t.is(shortTs('2026-04-17T12:34:56.789Z'), '2026-04-17 12:34')
  t.is(shortTs('2026-04-17T12:34:00Z'), '2026-04-17 12:34')
})

test('shortTs: passes through non-matching input', (t) => {
  t.is(shortTs('not-a-timestamp'), 'not-a-timestamp')
})

test('truncate: short strings pass through', (t) => {
  t.is(truncate('short', 10), 'short')
})

test('truncate: long strings get ellipsis', (t) => {
  t.is(truncate('abcdefghij', 5), 'abcd…')
})

test('handleLabel: with display name', (t) => {
  t.is(handleLabel('anon-wyrm-abc12345', 'Alice'), 'Alice (anon-wyrm-abc12345)')
})

test('handleLabel: null display name → just id', (t) => {
  t.is(handleLabel('anon-wyrm-abc12345', null), 'anon-wyrm-abc12345')
})

test('handleLabel: empty display name → just id', (t) => {
  t.is(handleLabel('anon-wyrm-abc12345', '   '), 'anon-wyrm-abc12345')
})

// ─── Fake client ────────────────────────────────────────────────────

interface Fake {
  status: StatusPayload
  agents: AgentPayload[]
  tasks: ListPage<TaskState>
  messages: ListPage<MessageEntry>
  knowledge: ListPage<KnowledgeEntry>
}

function fakeClient(fake: Fake): OpenPact {
  return {
    status: () => Promise.resolve(fake.status),
    agents: () => Promise.resolve(fake.agents),
    tasks: { list: () => Promise.resolve(fake.tasks) },
    messages: { list: () => Promise.resolve(fake.messages) },
    knowledge: { list: () => Promise.resolve(fake.knowledge) },
  } as unknown as OpenPact
}

function status(overrides: Partial<StatusPayload> = {}): StatusPayload {
  return {
    pact_id: 'deadbeef',
    pact_name: 'Alpha Pact',
    pact_purpose: 'test purpose',
    peer_handle: 'anon-me-00000001',
    display_name: 'Me',
    role: 'creator',
    public_key: null,
    agents: 0,
    entries: 0,
    is_member: true,
    is_indexer: true,
    synced: true,
    ...overrides,
  }
}

function msg(
  id: string,
  handle: string,
  content: string,
  ts = '2026-04-17T12:00:00Z',
): MessageEntry {
  return {
    id,
    type: 'message',
    timestamp: ts,
    agent_id: handle,
    display_name: null,
    payload: { content },
  }
}

function know(
  id: string,
  handle: string,
  topic: string,
  content: string,
  ts = '2026-04-17T12:00:00Z',
): KnowledgeEntry {
  return {
    id,
    type: 'knowledge',
    timestamp: ts,
    agent_id: handle,
    display_name: null,
    payload: { topic, content },
  }
}

function taskState(
  id: string,
  title: string,
  creatorHandle: string,
  createdTs = '2026-04-17T12:00:00Z',
): TaskState {
  return {
    id,
    title,
    status: 'open',
    claimed_by: null,
    assigned_to: null,
    timestamp: createdTs,
    updated_at: createdTs,
    claimed_at: null,
    expired_at: null,
    result: null,
    history: [
      {
        id: `${id}-0`,
        type: 'task',
        timestamp: createdTs,
        agent_id: creatorHandle,
        display_name: null,
        payload: { title, status: 'open' },
      },
    ],
  }
}

// ─── buildSessionContext ────────────────────────────────────────────

test('session: includes pact name, purpose, handle, peers, tasks, messages', async (t) => {
  const out = await buildSessionContext(
    fakeClient({
      status: status(),
      agents: [
        { id: 'anon-me-00000001', remote_key: 'aaa', online: true },
        { id: 'anon-peer-00000002', remote_key: 'bbb', online: true, display_name: 'Bob' },
      ],
      tasks: {
        entries: [taskState('t-1', 'Migrate auth', 'anon-peer-00000002')],
        cursor: null,
        has_more: false,
      },
      messages: {
        entries: [msg('m-1', 'anon-peer-00000002', 'Starting refactor of router/*')],
        cursor: null,
        has_more: false,
      },
      knowledge: { entries: [], cursor: null, has_more: false },
    }),
  )
  t.ok(out)
  t.ok(out!.includes('Alpha Pact'))
  t.ok(out!.includes('test purpose'))
  t.ok(out!.includes('anon-me-00000001'))
  t.ok(out!.includes('Peers online: 1'))
  t.ok(out!.includes('Bob (anon-peer-00000002)'))
  t.ok(out!.includes('t-1 — Migrate auth'))
  t.ok(out!.includes('Starting refactor of router/*'))
  t.absent(out!.includes('anon-me-00000001:'), 'self-authored messages excluded')
})

test('session: empty pact still renders a header + handle', async (t) => {
  const out = await buildSessionContext(
    fakeClient({
      status: status({ pact_name: null, pact_purpose: null }),
      agents: [{ id: 'anon-me-00000001', remote_key: 'aaa', online: true }],
      tasks: { entries: [], cursor: null, has_more: false },
      messages: { entries: [], cursor: null, has_more: false },
      knowledge: { entries: [], cursor: null, has_more: false },
    }),
  )
  t.ok(out)
  t.ok(out!.includes('Pact: deadbeef'), 'falls back to pact_id prefix when name missing')
  t.ok(out!.includes('Peers online: 0'))
  t.absent(out!.includes('Open tasks'))
  t.absent(out!.includes('Recent messages'))
})

test('session: filters out self from messages', async (t) => {
  const out = await buildSessionContext(
    fakeClient({
      status: status(),
      agents: [],
      tasks: { entries: [], cursor: null, has_more: false },
      messages: {
        entries: [
          msg('m-1', 'anon-me-00000001', 'this is me'),
          msg('m-2', 'anon-peer-00000002', 'this is them'),
        ],
        cursor: null,
        has_more: false,
      },
      knowledge: { entries: [], cursor: null, has_more: false },
    }),
  )
  t.ok(out!.includes('this is them'))
  t.absent(out!.includes('this is me'))
})

// ─── buildPromptContext ────────────────────────────────────────────

const cursor = { lastSeen: '2026-04-17T12:00:00Z', pactId: 'default', cwd: '/p' }

test('prompt: nothing new returns null', async (t) => {
  const out = await buildPromptContext(
    fakeClient({
      status: status(),
      agents: [],
      tasks: { entries: [], cursor: null, has_more: false },
      messages: { entries: [], cursor: null, has_more: false },
      knowledge: { entries: [], cursor: null, has_more: false },
    }),
    cursor,
  )
  t.is(out, null)
})

test('prompt: only self-authored activity since cursor returns null', async (t) => {
  const out = await buildPromptContext(
    fakeClient({
      status: status(),
      agents: [],
      tasks: {
        entries: [taskState('t-1', 'my task', 'anon-me-00000001', '2026-04-17T13:00:00Z')],
        cursor: null,
        has_more: false,
      },
      messages: {
        entries: [msg('m-1', 'anon-me-00000001', 'my message', '2026-04-17T13:00:00Z')],
        cursor: null,
        has_more: false,
      },
      knowledge: {
        entries: [know('k-1', 'anon-me-00000001', 'x', 'y', '2026-04-17T13:00:00Z')],
        cursor: null,
        has_more: false,
      },
    }),
    cursor,
  )
  t.is(out, null)
})

test('prompt: peer activity after cursor renders each section', async (t) => {
  const out = await buildPromptContext(
    fakeClient({
      status: status(),
      agents: [],
      tasks: {
        entries: [taskState('t-9', 'Refactor auth', 'anon-peer-00000002', '2026-04-17T13:00:00Z')],
        cursor: null,
        has_more: false,
      },
      messages: {
        entries: [msg('m-9', 'anon-peer-00000002', 'I claimed a task', '2026-04-17T13:00:00Z')],
        cursor: null,
        has_more: false,
      },
      knowledge: {
        entries: [
          know(
            'k-9',
            'anon-peer-00000002',
            'routing',
            'Use the resolver factory',
            '2026-04-17T13:00:00Z',
          ),
        ],
        cursor: null,
        has_more: false,
      },
    }),
    cursor,
  )
  t.ok(out)
  t.ok(out!.includes('Messages from peers:'))
  t.ok(out!.includes('I claimed a task'))
  t.ok(out!.includes('New tasks:'))
  t.ok(out!.includes('Refactor auth'))
  t.ok(out!.includes('New knowledge:'))
  t.ok(out!.includes('Use the resolver factory'))
})

test('prompt: filters entries at or before cursor', async (t) => {
  const out = await buildPromptContext(
    fakeClient({
      status: status(),
      agents: [],
      tasks: { entries: [], cursor: null, has_more: false },
      messages: {
        entries: [
          msg('m-old', 'anon-peer-00000002', 'old news', '2026-04-17T11:00:00Z'),
          msg('m-eq', 'anon-peer-00000002', 'cursor-equal', '2026-04-17T12:00:00Z'),
          msg('m-new', 'anon-peer-00000002', 'fresh', '2026-04-17T13:00:00Z'),
        ],
        cursor: null,
        has_more: false,
      },
      knowledge: { entries: [], cursor: null, has_more: false },
    }),
    cursor,
  )
  t.ok(out!.includes('fresh'))
  t.absent(out!.includes('old news'))
  t.absent(out!.includes('cursor-equal'), 'cursor boundary is exclusive')
})
