import test from 'brittle'
import { OpenPactClient } from '../../src/client'
import { tasksResource } from '../../src/resources/tasks'
import {
  TaskNotOpenError,
  TaskAlreadyCompleteError,
  NotClaimerError,
  NotClaimedError,
  NotFoundError,
} from '../../src/errors'
import { mockFetch } from '../helpers/mock-fetch'

const taskState = {
  id: 'aaaa-1',
  title: 'Build it',
  status: 'open' as const,
  claimed_by: null,
  result: null,
  history: [],
}

test('tasks.list: builds URL with status filter', async (t) => {
  const m = mockFetch({ status: 200, body: [taskState] })
  const r = tasksResource(new OpenPactClient({ fetch: m.fetch }))
  await r.list({ status: 'open' })
  t.is(m.calls[0].url, 'http://127.0.0.1:7666/v1/tasks?status=open')
})

test('tasks.get: encodes id and returns state', async (t) => {
  const m = mockFetch({ status: 200, body: taskState })
  const r = tasksResource(new OpenPactClient({ fetch: m.fetch }))
  const res = await r.get('aaaa-1')
  t.is(res.id, 'aaaa-1')
  t.is(m.calls[0].url, 'http://127.0.0.1:7666/v1/tasks/aaaa-1')
})

test('tasks.get: 404 → NotFoundError', async (t) => {
  const m = mockFetch({ status: 404, body: { error: 'NOT_FOUND', message: 'no task' } })
  const r = tasksResource(new OpenPactClient({ fetch: m.fetch }))
  await t.exception(() => r.get('zzzz-9'), NotFoundError)
})

test('tasks.create: POSTs title + description', async (t) => {
  const m = mockFetch({ status: 200, body: { id: 'aaaa-1', timestamp: 'now' } })
  const r = tasksResource(new OpenPactClient({ fetch: m.fetch }))
  await r.create({ title: 'Build it', description: 'badly' })
  t.is(m.calls[0].method, 'POST')
  t.alike(JSON.parse(m.calls[0].body!), { title: 'Build it', description: 'badly' })
})

test('tasks.claim: PUT, parses task on success', async (t) => {
  const m = mockFetch({
    status: 200,
    body: { ok: true, task: { ...taskState, status: 'claimed', claimed_by: 'me' } },
  })
  const r = tasksResource(new OpenPactClient({ fetch: m.fetch }))
  const res = await r.claim('aaaa-1')
  t.is(res.task.status, 'claimed')
  t.is(m.calls[0].method, 'PUT')
  t.is(m.calls[0].url, 'http://127.0.0.1:7666/v1/tasks/aaaa-1/claim')
})

test('tasks.claim: 409 TASK_NOT_OPEN → TaskNotOpenError', async (t) => {
  const m = mockFetch({
    status: 409,
    body: { error: 'TASK_NOT_OPEN', message: 'task is claimed' },
  })
  const r = tasksResource(new OpenPactClient({ fetch: m.fetch }))
  await t.exception(() => r.claim('aaaa-1'), TaskNotOpenError)
})

test('tasks.complete: posts result body', async (t) => {
  const m = mockFetch({
    status: 200,
    body: { ok: true, task: { ...taskState, status: 'complete', result: 'shipped' } },
  })
  const r = tasksResource(new OpenPactClient({ fetch: m.fetch }))
  await r.complete('aaaa-1', { result: 'shipped' })
  t.alike(JSON.parse(m.calls[0].body!), { result: 'shipped' })
})

test('tasks.complete: 409 TASK_ALREADY_COMPLETE → TaskAlreadyCompleteError', async (t) => {
  const m = mockFetch({
    status: 409,
    body: { error: 'TASK_ALREADY_COMPLETE', message: 'already done' },
  })
  const r = tasksResource(new OpenPactClient({ fetch: m.fetch }))
  await t.exception(() => r.complete('aaaa-1'), TaskAlreadyCompleteError)
})

test('tasks.complete: 409 NOT_CLAIMER → NotClaimerError', async (t) => {
  const m = mockFetch({
    status: 409,
    body: { error: 'NOT_CLAIMER', message: 'not yours to complete' },
  })
  const r = tasksResource(new OpenPactClient({ fetch: m.fetch }))
  await t.exception(() => r.complete('aaaa-1', { result: 'x' }), NotClaimerError)
})

test('tasks.release: 409 NOT_CLAIMED → NotClaimedError', async (t) => {
  const m = mockFetch({
    status: 409,
    body: { error: 'NOT_CLAIMED', message: 'task is open' },
  })
  const r = tasksResource(new OpenPactClient({ fetch: m.fetch }))
  await t.exception(() => r.release('aaaa-1'), NotClaimedError)
})
