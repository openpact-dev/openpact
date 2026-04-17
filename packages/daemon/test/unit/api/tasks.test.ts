import test from 'brittle'
import { createApi } from '../../../src/api'
import { tmpDaemon } from '../../helpers/tmp-daemon'

async function postTask(app: any, body: Record<string, unknown>) {
  const res = await app.inject({ method: 'POST', url: '/v1/pacts/default/tasks', payload: body })
  if (res.statusCode !== 200) throw new Error(`postTask failed: ${res.body}`)
  return JSON.parse(res.body)
}

test('POST /v1/tasks: creates open task, echoes TaskState', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const res = await app.inject({
    method: 'POST',
    url: '/v1/pacts/default/tasks',
    payload: { title: 'Build landing page' },
  })
  t.is(res.statusCode, 200)
  const body = JSON.parse(res.body)
  t.ok(/^[0-9a-f]{8}-\d+$/.test(body.id))
  t.is(body.title, 'Build landing page')
  t.is(body.status, 'open')
  t.is(body.claimed_by, null)
  t.ok(Array.isArray(body.history) && body.history.length === 1)
})

test('POST /v1/tasks: missing title returns 400', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const res = await app.inject({ method: 'POST', url: '/v1/pacts/default/tasks', payload: {} })
  t.is(res.statusCode, 400)
})

test('GET /v1/tasks: returns reduced states', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  await postTask(app, { title: 'Task A' })
  await postTask(app, { title: 'Task B' })
  await daemon.update()
  await daemon.waitForViewVersion(2, { timeout: 2000 })

  const res = await app.inject({ method: 'GET', url: '/v1/pacts/default/tasks' })
  const body = JSON.parse(res.body)
  t.is(body.entries.length, 2)
  t.is(body.entries[0].status, 'open')
  t.is(body.has_more, false)
})

test('GET /v1/tasks?status=open filters', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const a = await postTask(app, { title: 'Task A' })
  await postTask(app, { title: 'Task B' })
  await app.inject({ method: 'PUT', url: `/v1/pacts/default/tasks/${a.id}/claim` })
  await daemon.update()

  const open = JSON.parse(
    (await app.inject({ method: 'GET', url: '/v1/pacts/default/tasks?status=open' })).body,
  )
  const claimed = JSON.parse(
    (await app.inject({ method: 'GET', url: '/v1/pacts/default/tasks?status=claimed' })).body,
  )
  t.is(open.entries.length, 1)
  t.is(claimed.entries.length, 1)
})

test('GET /v1/tasks/:id: 404 on unknown', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const res = await app.inject({ method: 'GET', url: '/v1/pacts/default/tasks/abcd-99' })
  t.is(res.statusCode, 404)
})

test('PUT /v1/tasks/:id/claim: open → claimed', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const { id } = await postTask(app, { title: 'Build it' })
  const res = await app.inject({ method: 'PUT', url: `/v1/pacts/default/tasks/${id}/claim` })
  t.is(res.statusCode, 200)
  const body = JSON.parse(res.body)
  t.is(body.status, 'claimed')
  t.is(body.claimed_by, daemon.peerHandle)
})

test('PUT /v1/tasks/:id/claim: double claim same peer → 409 TASK_NOT_OPEN', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const { id } = await postTask(app, { title: 'Once' })
  await app.inject({ method: 'PUT', url: `/v1/pacts/default/tasks/${id}/claim` })
  const res = await app.inject({ method: 'PUT', url: `/v1/pacts/default/tasks/${id}/claim` })
  t.is(res.statusCode, 409)
  t.is(JSON.parse(res.body).error, 'TASK_NOT_OPEN')
})

test('PUT /v1/tasks/:id/complete: claimer completes', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const { id } = await postTask(app, { title: 'Build' })
  await app.inject({ method: 'PUT', url: `/v1/pacts/default/tasks/${id}/claim` })
  const res = await app.inject({
    method: 'PUT',
    url: `/v1/pacts/default/tasks/${id}/complete`,
    payload: { result: 'shipped' },
  })
  t.is(res.statusCode, 200)
  const body = JSON.parse(res.body)
  t.is(body.status, 'complete')
  t.is(body.result, 'shipped')
})

test('PUT /v1/tasks/:id/complete: skip-claim from open allowed', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const { id } = await postTask(app, { title: 'Quickie' })
  const res = await app.inject({
    method: 'PUT',
    url: `/v1/pacts/default/tasks/${id}/complete`,
    payload: { result: 'done' },
  })
  t.is(res.statusCode, 200)
  t.is(JSON.parse(res.body).status, 'complete')
})

test('PUT /v1/tasks/:id/release: claimer reverts to open', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const { id } = await postTask(app, { title: 'Maybe' })
  await app.inject({ method: 'PUT', url: `/v1/pacts/default/tasks/${id}/claim` })
  const res = await app.inject({ method: 'PUT', url: `/v1/pacts/default/tasks/${id}/release` })
  t.is(res.statusCode, 200)
  t.is(JSON.parse(res.body).status, 'open')
})

test('POST /v1/tasks: assigned_to surfaces on the created task', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const res = await app.inject({
    method: 'POST',
    url: '/v1/pacts/default/tasks',
    payload: { title: 'for rat', assigned_to: 'anon-rat-12345678' },
  })
  t.is(res.statusCode, 200)
  const body = JSON.parse(res.body)
  t.is(body.assigned_to, 'anon-rat-12345678')
  t.is(body.status, 'open')
})

test('POST /v1/tasks: malformed assigned_to returns 400', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const res = await app.inject({
    method: 'POST',
    url: '/v1/pacts/default/tasks',
    payload: { title: 'x', assigned_to: 'not-a-handle' },
  })
  t.is(res.statusCode, 400)
})

test('PUT /v1/tasks/:id/claim: non-assignee gets 409 NOT_ASSIGNEE', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  // Assign to a handle that isn't this peer.
  const otherHandle = 'anon-falcon-deadbeef'
  t.not(otherHandle, daemon.peerHandle)
  const { id } = await postTask(app, { title: 'Reserved', assigned_to: otherHandle })

  const res = await app.inject({ method: 'PUT', url: `/v1/pacts/default/tasks/${id}/claim` })
  t.is(res.statusCode, 409)
  t.is(JSON.parse(res.body).error, 'NOT_ASSIGNEE')
})

test('PUT /v1/tasks/:id/claim: assignee can claim their own task', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const { id } = await postTask(app, { title: 'mine', assigned_to: daemon.peerHandle! })
  const res = await app.inject({ method: 'PUT', url: `/v1/pacts/default/tasks/${id}/claim` })
  t.is(res.statusCode, 200)
  const body = JSON.parse(res.body)
  t.is(body.status, 'claimed')
  t.is(body.claimed_by, daemon.peerHandle)
})

test('PUT /v1/tasks/:id/release: 409 NOT_CLAIMED on open task', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const { id } = await postTask(app, { title: 'Untouched' })
  const res = await app.inject({ method: 'PUT', url: `/v1/pacts/default/tasks/${id}/release` })
  t.is(res.statusCode, 409)
  t.is(JSON.parse(res.body).error, 'NOT_CLAIMED')
})

test('PUT /v1/tasks/:id/{claim,complete,release}: 404 on unknown task', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  for (const path of ['claim', 'complete', 'release']) {
    const res = await app.inject({
      method: 'PUT',
      url: `/v1/pacts/default/tasks/abcd-99/${path}`,
      payload: {},
    })
    t.is(res.statusCode, 404, path)
  }
})
