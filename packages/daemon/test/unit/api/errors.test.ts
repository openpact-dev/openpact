import test from 'brittle'
import { HttpError, envelope } from '../../../src/api/errors'
import { createApi } from '../../../src/api'
import { tmpDaemon } from '../../helpers/tmp-daemon'

test('envelope: shape is { error, message, status }', (t) => {
  const e = envelope(409, 'TASK_ALREADY_CLAIMED', 'task X is claimed')
  t.alike(e, { error: 'TASK_ALREADY_CLAIMED', message: 'task X is claimed', status: 409 })
})

test('HttpError: carries status, code, message', (t) => {
  const err = new HttpError(404, 'NOT_FOUND', 'thing missing')
  t.is(err.status, 404)
  t.is(err.code, 'NOT_FOUND')
  t.is(err.message, 'thing missing')
  t.is(err.name, 'HttpError')
})

test('error envelope shape: 400 BAD_REQUEST from validation', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const res = await app.inject({
    method: 'POST',
    url: '/v1/pacts/default/knowledge',
    payload: { content: 'no topic' },
  })
  t.is(res.statusCode, 400)
  const body = JSON.parse(res.body)
  t.is(body.error, 'BAD_REQUEST')
  t.is(body.status, 400)
  t.ok(typeof body.message === 'string')
})

test('error envelope shape: 404 NOT_FOUND from unknown route', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const res = await app.inject({ method: 'GET', url: '/v1/never' })
  t.is(res.statusCode, 404)
  const body = JSON.parse(res.body)
  t.is(body.error, 'NOT_FOUND')
  t.is(body.status, 404)
})

test('error envelope shape: 409 from HttpError throw', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const post = await app.inject({
    method: 'POST',
    url: '/v1/pacts/default/tasks',
    payload: { title: 'x' },
  })
  const { id } = JSON.parse(post.body)
  await app.inject({ method: 'PUT', url: `/v1/pacts/default/tasks/${id}/claim` })
  const res = await app.inject({ method: 'PUT', url: `/v1/pacts/default/tasks/${id}/claim` })
  t.is(res.statusCode, 409)
  const body = JSON.parse(res.body)
  t.is(body.error, 'TASK_NOT_OPEN')
  t.is(body.status, 409)
})
