import test from 'brittle'
import { createApi } from '../../../src/api'
import { tmpDaemon } from '../../helpers/tmp-daemon'

const KEY_B = 'bb'.repeat(32)

test('POST /v1/admin/writers: appends admin entry', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  // Write a knowledge entry first so the creator becomes the bootstrap indexer.
  await daemon.append({
    type: 'knowledge',
    timestamp: new Date().toISOString(),
    agent_id: daemon.peerHandle!,
    payload: { topic: 'init', content: 'first' },
  })
  await daemon.update()

  const res = await app.inject({
    method: 'POST',
    url: '/v1/admin/writers',
    payload: { key: KEY_B, indexer: false },
  })
  t.is(res.statusCode, 200)
  const body = JSON.parse(res.body)
  t.is(body.ok, true)
  t.is(body.key, KEY_B)
  t.is(body.indexer, false)
})

test('POST /v1/admin/writers: indexer flag honoured', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const res = await app.inject({
    method: 'POST',
    url: '/v1/admin/writers',
    payload: { key: KEY_B, indexer: true },
  })
  t.is(res.statusCode, 200)
  t.is(JSON.parse(res.body).indexer, true)
})

test('POST /v1/admin/writers: rejects bad hex with 400', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const res = await app.inject({
    method: 'POST',
    url: '/v1/admin/writers',
    payload: { key: 'short' },
  })
  t.is(res.statusCode, 400)
  t.is(JSON.parse(res.body).error, 'BAD_REQUEST')
})

test('POST /v1/admin/writers: missing key returns 400', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const res = await app.inject({
    method: 'POST',
    url: '/v1/admin/writers',
    payload: { indexer: true },
  })
  t.is(res.statusCode, 400)
})

test('DELETE /v1/admin/writers/:key: appends remove admin entry', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  // Add then remove.
  await app.inject({
    method: 'POST',
    url: '/v1/admin/writers',
    payload: { key: KEY_B, indexer: true },
  })
  const res = await app.inject({
    method: 'DELETE',
    url: `/v1/admin/writers/${KEY_B}`,
  })
  t.is(res.statusCode, 200)
  t.is(JSON.parse(res.body).key, KEY_B)
})

test('DELETE /v1/admin/writers/:key: bad hex → 400', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const res = await app.inject({
    method: 'DELETE',
    url: '/v1/admin/writers/notlongenough',
  })
  t.is(res.statusCode, 400)
})
