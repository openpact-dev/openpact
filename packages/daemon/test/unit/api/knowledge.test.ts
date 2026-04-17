import test from 'brittle'
import { createApi } from '../../../src/api'
import { tmpDaemon } from '../../helpers/tmp-daemon'

test('POST /v1/knowledge: echoes the created knowledge entry', async (t) => {
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
  t.ok(/^[0-9a-f]{8}-\d+$/.test(body.id), 'id matches entry-id format')
  t.is(body.type, 'knowledge')
  t.is(body.agent_id, daemon.peerHandle)
  t.is(body.payload.topic, 'sales')
  t.is(body.payload.content, 'Tuesdays convert')
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
  const body = JSON.parse(res.body)
  t.is(body.entries.length, 1)
  t.is(body.entries[0].payload.topic, 'sales')
  t.is(body.has_more, false)
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
  const body = JSON.parse(res.body)
  t.is(body.entries.length, 3)
  t.is(body.has_more, true, 'more remain past the page')
  t.ok(body.cursor, 'cursor returned')
})

test('GET /v1/knowledge: cursor walks every page', async (t) => {
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

  const seen: string[] = []
  let cursor: string | null = null
  let hasMore = true
  let pages = 0
  while (hasMore) {
    const params = new URLSearchParams({ limit: '2' })
    if (cursor) params.set('cursor', cursor)
    const res = await app.inject({ method: 'GET', url: `/v1/pacts/default/knowledge?${params}` })
    const body = JSON.parse(res.body)
    for (const e of body.entries) seen.push(e.payload.content)
    cursor = body.cursor
    hasMore = body.has_more
    if (++pages > 10) t.fail('cursor loop did not terminate')
  }
  t.is(seen.length, 5)
  // Default order is desc — newest first.
  t.alike(seen, ['c4', 'c3', 'c2', 'c1', 'c0'])
})

test('GET /v1/knowledge: asc order returns oldest first', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  for (let i = 0; i < 3; i++) {
    await app.inject({
      method: 'POST',
      url: '/v1/pacts/default/knowledge',
      payload: { topic: 't', content: `c${i}` },
    })
  }
  await daemon.update()
  await daemon.waitForViewVersion(3, { timeout: 2000 })

  const res = await app.inject({ method: 'GET', url: '/v1/pacts/default/knowledge?order=asc' })
  const body = JSON.parse(res.body)
  t.alike(
    body.entries.map((e: any) => e.payload.content),
    ['c0', 'c1', 'c2'],
  )
})

test('GET /v1/knowledge: malformed cursor returns 400 BAD_CURSOR', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const res = await app.inject({
    method: 'GET',
    url: '/v1/pacts/default/knowledge?cursor=task/whatever',
  })
  t.is(res.statusCode, 400)
  t.is(JSON.parse(res.body).error, 'BAD_CURSOR')
})

test('GET /v1/knowledge: no entries returns empty envelope', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const res = await app.inject({ method: 'GET', url: '/v1/pacts/default/knowledge' })
  t.is(res.statusCode, 200)
  const body = JSON.parse(res.body)
  t.alike(body.entries, [])
  t.is(body.cursor, null)
  t.is(body.has_more, false)
})
