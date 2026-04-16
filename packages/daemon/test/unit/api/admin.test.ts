import test from 'brittle'
import { createApi } from '../../../src/api'
import { tmpDaemon } from '../../helpers/tmp-daemon'

const KEY_B = 'bb'.repeat(32)

test('POST /v1/admin/members: appends admin entry', async (t) => {
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
    url: '/v1/pacts/default/admin/members',
    payload: { key: KEY_B, indexer: false, confirm: true },
  })
  t.is(res.statusCode, 200)
  const body = JSON.parse(res.body)
  t.is(body.ok, true)
  t.is(body.key, KEY_B)
  t.is(body.indexer, false)
})

test('POST /v1/admin/members: indexer flag honoured', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const res = await app.inject({
    method: 'POST',
    url: '/v1/pacts/default/admin/members',
    payload: { key: KEY_B, indexer: true, confirm: true },
  })
  t.is(res.statusCode, 200)
  t.is(JSON.parse(res.body).indexer, true)
})

test('POST /v1/admin/members: rejects bad hex with 400', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const res = await app.inject({
    method: 'POST',
    url: '/v1/pacts/default/admin/members',
    payload: { key: 'short', confirm: true },
  })
  t.is(res.statusCode, 400)
  t.is(JSON.parse(res.body).error, 'BAD_REQUEST')
})

test('POST /v1/admin/members: missing key returns 400', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const res = await app.inject({
    method: 'POST',
    url: '/v1/pacts/default/admin/members',
    payload: { indexer: true, confirm: true },
  })
  t.is(res.statusCode, 400)
})

test('DELETE /v1/admin/members/:key: appends remove admin entry', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  // Add then remove.
  await app.inject({
    method: 'POST',
    url: '/v1/pacts/default/admin/members',
    payload: { key: KEY_B, indexer: true, confirm: true },
  })
  const res = await app.inject({
    method: 'DELETE',
    url: `/v1/pacts/default/admin/members/${KEY_B}`,
  })
  t.is(res.statusCode, 200)
  t.is(JSON.parse(res.body).key, KEY_B)
})

test('DELETE /v1/admin/members/:key: bad hex → 400', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const res = await app.inject({
    method: 'DELETE',
    url: '/v1/pacts/default/admin/members/notlongenough',
  })
  t.is(res.statusCode, 400)
})
