import test from 'brittle'
import { createApi } from '../../../src/api'
import { tmpDaemon } from '../../helpers/tmp-daemon'

test('POST /v1/knowledge: happy path', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const res = await app.inject({
    method: 'POST',
    url: '/v1/pacts/default/knowledge',
    payload: { topic: 'sales', content: 'Tuesdays convert' },
  })
  t.is(res.statusCode, 200)
  const body = JSON.parse(res.body)
  t.ok(/^[0-9a-f]{4}-\d+$/.test(body.id), 'id matches entry-id format')
  t.ok(typeof body.timestamp === 'string')
})

test('POST /v1/knowledge: missing topic returns 400 BAD_REQUEST', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const res = await app.inject({
    method: 'POST',
    url: '/v1/pacts/default/knowledge',
    payload: { content: 'no topic' },
  })
  t.is(res.statusCode, 400)
  t.is(JSON.parse(res.body).error, 'BAD_REQUEST')
})

test('POST /v1/knowledge: confidence out of range returns 400', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const res = await app.inject({
    method: 'POST',
    url: '/v1/pacts/default/knowledge',
    payload: { topic: 'x', content: 'y', confidence: 2 },
  })
  t.is(res.statusCode, 400)
})

test('GET /v1/knowledge: filters by topic', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  await app.inject({
    method: 'POST',
    url: '/v1/pacts/default/knowledge',
    payload: { topic: 'sales', content: 'A' },
  })
  await app.inject({
    method: 'POST',
    url: '/v1/pacts/default/knowledge',
    payload: { topic: 'eng', content: 'B' },
  })
  await daemon.update()
  await daemon.waitForViewVersion(2, { timeout: 2000 })

  const res = await app.inject({ method: 'GET', url: '/v1/pacts/default/knowledge?topic=sales' })
  t.is(res.statusCode, 200)
  const entries = JSON.parse(res.body) as any[]
  t.is(entries.length, 1)
  t.is(entries[0].payload.topic, 'sales')
})

test('GET /v1/knowledge: limit caps results', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  for (let i = 0; i < 5; i++) {
    await app.inject({
      method: 'POST',
      url: '/v1/pacts/default/knowledge',
      payload: { topic: 't', content: `c${i}` },
    })
  }
  await daemon.update()
  await daemon.waitForViewVersion(5, { timeout: 2000 })

  const res = await app.inject({ method: 'GET', url: '/v1/pacts/default/knowledge?limit=3' })
  const entries = JSON.parse(res.body) as any[]
  t.is(entries.length, 3)
})

test('GET /v1/knowledge: no entries returns []', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const res = await app.inject({ method: 'GET', url: '/v1/pacts/default/knowledge' })
  t.is(res.statusCode, 200)
  t.alike(JSON.parse(res.body), [])
})
