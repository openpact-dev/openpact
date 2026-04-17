import test from 'brittle'
import { OpenPactClient } from '../../src/client'
import { tasksResource } from '../../src/resources/tasks'
import {
  TaskNotOpenError,
  TaskAlreadyCompleteError,
  NotClaimerError,
  NotClaimedError,
  NotFoundError,
  ViewTimeoutError,
  RateLimitedError,
} from '../../src/errors'
import { mockFetch } from '../helpers/mock-fetch'

const taskState = {
  id: 'aaaaaaaa-1',
  title: 'Build it',
  status: 'open' as const,
  claimed_by: null,
  result: null,
  history: [],
}

test('tasks.list: builds URL with status filter', async (t) => {
  const m = mockFetch({
    status: 200,
    body: { entries: [taskState], cursor: 'task/a', has_more: false },
  })
  const r = tasksResource(new OpenPactClient({ fetch: m.fetch, pactId: 'default' }))
  const page = await r.list({ status: 'open' })
  t.is(m.calls[0].url, 'http://127.0.0.1:7666/v1/pacts/default/tasks?status=open')
  t.is(page.entries.length, 1)
  t.is(page.has_more, false)
})

test('tasks.iterate: walks pages', async (t) => {
  const m = mockFetch(
    {
      status: 200,
      body: {
        entries: [{ ...taskState, id: 'b' }],
        cursor: 'task/b',
        has_more: true,
      },
    },
    {
      status: 200,
      body: {
        entries: [{ ...taskState, id: 'a' }],
        cursor: 'task/a',
        has_more: false,
      },
    },
  )
  const r = tasksResource(new OpenPactClient({ fetch: m.fetch, pactId: 'default' }))
  const seen: string[] = []
  for await (const task of r.iterate()) seen.push(task.id)
  t.alike(seen, ['b', 'a'])
})

test('tasks.get: encodes id and returns state', async (t) => {
  const m = mockFetch({ status: 200, body: taskState })
  const r = tasksResource(new OpenPactClient({ fetch: m.fetch, pactId: 'default' }))
  const res = await r.get('aaaaaaaa-1')
  t.is(res.id, 'aaaaaaaa-1')
  t.is(m.calls[0].url, 'http://127.0.0.1:7666/v1/pacts/default/tasks/aaaaaaaa-1')
})

test('tasks.get: 404 → NotFoundError', async (t) => {
  const m = mockFetch({ status: 404, body: { error: 'NOT_FOUND', message: 'no task' } })
  const r = tasksResource(new OpenPactClient({ fetch: m.fetch, pactId: 'default' }))
  await t.exception(() => r.get('zzzz-9'), NotFoundError)
})

test('tasks.create: POSTs title + description, parses TaskState response', async (t) => {
  const m = mockFetch({ status: 200, body: taskState })
  const r = tasksResource(new OpenPactClient({ fetch: m.fetch, pactId: 'default' }))
  const res = await r.create({ title: 'Build it', description: 'badly' })
  t.is(m.calls[0].method, 'POST')
  t.alike(JSON.parse(m.calls[0].body!), { title: 'Build it', description: 'badly' })
  t.is(res.id, 'aaaaaaaa-1')
  t.is(res.status, 'open')
})

test('tasks.claim: PUT, returns TaskState on success', async (t) => {
  const m = mockFetch({
    status: 200,
    body: { ...taskState, status: 'claimed', claimed_by: 'me' },
  })
  const r = tasksResource(new OpenPactClient({ fetch: m.fetch, pactId: 'default' }))
  const res = await r.claim('aaaaaaaa-1')
  t.is(res.status, 'claimed')
  t.is(res.claimed_by, 'me')
  t.is(m.calls[0].method, 'PUT')
  t.is(m.calls[0].url, 'http://127.0.0.1:7666/v1/pacts/default/tasks/aaaaaaaa-1/claim')
})

test('tasks.claim: 409 TASK_NOT_OPEN → TaskNotOpenError', async (t) => {
  const m = mockFetch({
    status: 409,
    body: { error: 'TASK_NOT_OPEN', message: 'task is claimed' },
  })
  const r = tasksResource(new OpenPactClient({ fetch: m.fetch, pactId: 'default' }))
  await t.exception(() => r.claim('aaaaaaaa-1'), TaskNotOpenError)
})

test('tasks.complete: posts result body, returns TaskState', async (t) => {
  const m = mockFetch({
    status: 200,
    body: { ...taskState, status: 'complete', result: 'shipped' },
  })
  const r = tasksResource(new OpenPactClient({ fetch: m.fetch, pactId: 'default' }))
  const res = await r.complete('aaaaaaaa-1', { result: 'shipped' })
  t.alike(JSON.parse(m.calls[0].body!), { result: 'shipped' })
  t.is(res.status, 'complete')
  t.is(res.result, 'shipped')
})

test('tasks.complete: 409 TASK_ALREADY_COMPLETE → TaskAlreadyCompleteError', async (t) => {
  const m = mockFetch({
    status: 409,
    body: { error: 'TASK_ALREADY_COMPLETE', message: 'already done' },
  })
  const r = tasksResource(new OpenPactClient({ fetch: m.fetch, pactId: 'default' }))
  await t.exception(() => r.complete('aaaaaaaa-1'), TaskAlreadyCompleteError)
})

test('tasks.complete: 409 NOT_CLAIMER → NotClaimerError', async (t) => {
  const m = mockFetch({
    status: 409,
    body: { error: 'NOT_CLAIMER', message: 'not yours to complete' },
  })
  const r = tasksResource(new OpenPactClient({ fetch: m.fetch, pactId: 'default' }))
  await t.exception(() => r.complete('aaaaaaaa-1', { result: 'x' }), NotClaimerError)
})

test('tasks.release: 409 NOT_CLAIMED → NotClaimedError', async (t) => {
  const m = mockFetch({
    status: 409,
    body: { error: 'NOT_CLAIMED', message: 'task is open' },
  })
  const r = tasksResource(new OpenPactClient({ fetch: m.fetch, pactId: 'default' }))
  await t.exception(() => r.release('aaaaaaaa-1'), NotClaimedError)
})

test('tasks.claim: 504 VIEW_TIMEOUT → ViewTimeoutError', async (t) => {
  const m = mockFetch({
    status: 504,
    body: { error: 'VIEW_TIMEOUT', message: 'view did not catch up' },
  })
  const r = tasksResource(new OpenPactClient({ fetch: m.fetch, pactId: 'default' }))
  await t.exception(() => r.claim('aaaaaaaa-1'), ViewTimeoutError)
})

test('tasks.list: 429 RATE_LIMITED → RateLimitedError', async (t) => {
  const m = mockFetch({
    status: 429,
    body: { error: 'RATE_LIMITED', message: 'retry in 15s' },
  })
  const r = tasksResource(new OpenPactClient({ fetch: m.fetch, pactId: 'default' }))
  await t.exception(() => r.list(), RateLimitedError)
})
