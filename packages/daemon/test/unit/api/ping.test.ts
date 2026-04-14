import test from 'brittle'
import { createApi } from '../../../src/api'
import { tmpDaemon } from '../../helpers/tmp-daemon'

test('GET /v1/ping returns { ok: true }', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const res = await app.inject({ method: 'GET', url: '/v1/ping' })
  t.is(res.statusCode, 200)
  t.alike(JSON.parse(res.body), { ok: true })
})

test('GET /v1/ping has application/json content type', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const res = await app.inject({ method: 'GET', url: '/v1/ping' })
  t.ok(res.headers['content-type']?.toString().includes('application/json'))
})

test('GET /v1/unknown returns 404 with envelope', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const res = await app.inject({ method: 'GET', url: '/v1/unknown' })
  t.is(res.statusCode, 404)
  const body = JSON.parse(res.body)
  t.is(body.error, 'NOT_FOUND')
  t.is(body.status, 404)
  t.ok(typeof body.message === 'string')
})
