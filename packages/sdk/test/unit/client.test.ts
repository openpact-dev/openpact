import test from 'brittle'
import { OpenPactClient, buildQuery } from '../../src/client'
import {
  BadRequestError,
  BadSkillNameError,
  DaemonError,
  DaemonNotRunningError,
  NotConfirmedError,
  NotFoundError,
  NotIndexerError,
  SkillChecksumMismatchError,
  TaskNotOpenError,
} from '../../src/errors'
import { mockFetch } from '../helpers/mock-fetch'

test('client: defaults baseUrl to http://127.0.0.1:7666', (t) => {
  const c = new OpenPactClient()
  t.is(c.baseUrl, 'http://127.0.0.1:7666')
})

test('client: builds baseUrl from host + port', (t) => {
  const c = new OpenPactClient({ host: 'foo.local', port: 9000 })
  t.is(c.baseUrl, 'http://foo.local:9000')
})

test('client: explicit baseUrl wins over host/port', (t) => {
  const c = new OpenPactClient({ baseUrl: 'http://override:1234', host: 'ignored', port: 1 })
  t.is(c.baseUrl, 'http://override:1234')
})

test('client: req returns parsed JSON on 2xx', async (t) => {
  const m = mockFetch({ status: 200, body: { hello: 'world' } })
  const c = new OpenPactClient({ fetch: m.fetch, pactId: 'default' })
  const res = await c.req<{ hello: string }>('/v1/ping')
  t.is(res.hello, 'world')
  t.is(m.calls[0].url, 'http://127.0.0.1:7666/v1/ping')
  t.is(m.calls[0].method, 'GET')
})

test('client: maps 400 → BadRequestError', async (t) => {
  const m = mockFetch({ status: 400, body: { error: 'BAD_REQUEST', message: 'missing topic' } })
  const c = new OpenPactClient({ fetch: m.fetch, pactId: 'default' })
  await t.exception(() => c.req('/v1/knowledge'), BadRequestError)
})

test('client: maps 404 → NotFoundError', async (t) => {
  const m = mockFetch({ status: 404, body: { error: 'NOT_FOUND', message: 'no such task' } })
  const c = new OpenPactClient({ fetch: m.fetch, pactId: 'default' })
  await t.exception(() => c.req('/v1/tasks/abcd-1'), NotFoundError)
})

test('client: maps 409 TASK_NOT_OPEN → TaskNotOpenError', async (t) => {
  const m = mockFetch({
    status: 409,
    body: { error: 'TASK_NOT_OPEN', message: 'task is claimed' },
  })
  const c = new OpenPactClient({ fetch: m.fetch, pactId: 'default' })
  await t.exception(() => c.req('/v1/tasks/x/claim'), TaskNotOpenError)
})

test('client: maps 400 SKILL_CHECKSUM_MISMATCH → SkillChecksumMismatchError', async (t) => {
  const m = mockFetch({
    status: 400,
    body: { error: 'SKILL_CHECKSUM_MISMATCH', message: 'checksum sha256:... does not match' },
  })
  const c = new OpenPactClient({ fetch: m.fetch, pactId: 'default' })
  await t.exception(() => c.req('/v1/skills'), SkillChecksumMismatchError)
})

test('client: maps 500 SKILL_CHECKSUM_MISMATCH → SkillChecksumMismatchError', async (t) => {
  const m = mockFetch({
    status: 500,
    body: {
      error: 'SKILL_CHECKSUM_MISMATCH',
      message: 'stored content does not match recorded checksum',
    },
  })
  const c = new OpenPactClient({ fetch: m.fetch, pactId: 'default' })
  await t.exception(() => c.req('/v1/skills/x/content'), SkillChecksumMismatchError)
})

test('client: maps 409 NOT_INDEXER → NotIndexerError', async (t) => {
  const m = mockFetch({
    status: 409,
    body: { error: 'NOT_INDEXER', message: 'role is reader, not creator' },
  })
  const c = new OpenPactClient({ fetch: m.fetch, pactId: 'default' })
  await t.exception(() => c.req('/v1/admin/promote'), NotIndexerError)
})

test('client: maps 400 BAD_SKILL_NAME → BadSkillNameError', async (t) => {
  const m = mockFetch({
    status: 400,
    body: { error: 'BAD_SKILL_NAME', message: 'name must match …' },
  })
  const c = new OpenPactClient({ fetch: m.fetch, pactId: 'default' })
  await t.exception(() => c.req('/v1/skills/x/install'), BadSkillNameError)
})

test('client: maps 400 NOT_CONFIRMED → NotConfirmedError', async (t) => {
  const m = mockFetch({
    status: 400,
    body: { error: 'NOT_CONFIRMED', message: 'confirm: true required' },
  })
  const c = new OpenPactClient({ fetch: m.fetch, pactId: 'default' })
  await t.exception(() => c.req('/v1/skills/x/install'), NotConfirmedError)
})

test('client: unknown error code → DaemonError', async (t) => {
  const m = mockFetch({ status: 418, body: { error: 'TEAPOT', message: 'short and stout' } })
  const c = new OpenPactClient({ fetch: m.fetch, pactId: 'default' })
  await t.exception(() => c.req('/v1/anything'), DaemonError)
})

test('client: ECONNREFUSED via cause → DaemonNotRunningError', async (t) => {
  const cause = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:7666'), {
    code: 'ECONNREFUSED',
  })
  const err = Object.assign(new TypeError('fetch failed'), { cause })
  const m = mockFetch({ networkError: err })
  const c = new OpenPactClient({ fetch: m.fetch, pactId: 'default' })
  await t.exception(() => c.req('/v1/ping'), DaemonNotRunningError)
})

test('client: ECONNREFUSED via top-level message → DaemonNotRunningError', async (t) => {
  const err = Object.assign(new Error('fetch failed: ECONNREFUSED'), {})
  const m = mockFetch({ networkError: err })
  const c = new OpenPactClient({ fetch: m.fetch, pactId: 'default' })
  await t.exception(() => c.req('/v1/ping'), DaemonNotRunningError)
})

test('client: other network error rethrown as-is', async (t) => {
  const err = new Error('something else entirely')
  const m = mockFetch({ networkError: err })
  const c = new OpenPactClient({ fetch: m.fetch, pactId: 'default' })
  await t.exception.all(() => c.req('/v1/ping'), /something else entirely/)
})

test('client: json POST sets content-type and body', async (t) => {
  const m = mockFetch({ status: 200, body: { id: 'aaaa-1', timestamp: 'now' } })
  const c = new OpenPactClient({ fetch: m.fetch, pactId: 'default' })
  await c.json('/v1/knowledge', 'POST', { topic: 'sales', content: 'hi' })
  t.is(m.calls[0].method, 'POST')
  t.is(m.calls[0].headers['content-type'], 'application/json')
  t.is(m.calls[0].body, '{"topic":"sales","content":"hi"}')
})

test('client: json DELETE without body omits content-type', async (t) => {
  const m = mockFetch({ status: 200, body: { ok: true } })
  const c = new OpenPactClient({ fetch: m.fetch, pactId: 'default' })
  await c.json('/v1/admin/writers/abc', 'DELETE')
  t.is(m.calls[0].method, 'DELETE')
  t.absent(m.calls[0].headers['content-type'])
  t.absent(m.calls[0].body)
})

test('buildQuery: empty input → empty string', (t) => {
  t.is(buildQuery({}), '')
  t.is(buildQuery({ topic: undefined, limit: null }), '')
})

test('buildQuery: includes only defined values', (t) => {
  t.is(buildQuery({ topic: 'sales', limit: 10 }), '?topic=sales&limit=10')
})

test('buildQuery: skips empty strings', (t) => {
  t.is(buildQuery({ topic: '', limit: 5 }), '?limit=5')
})
