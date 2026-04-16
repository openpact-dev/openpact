import test from 'brittle'
import { createApi } from '../../../src/api'
import { tmpDaemon } from '../../helpers/tmp-daemon'

test('POST /v1/messages: broadcast passes', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const res = await app.inject({
    method: 'POST',
    url: '/v1/pacts/default/messages',
    payload: { to: '*', content: 'heads up' },
  })
  t.is(res.statusCode, 200)
  t.ok(typeof JSON.parse(res.body).id === 'string')
})

test('POST /v1/messages: direct to handle passes', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const res = await app.inject({
    method: 'POST',
    url: '/v1/pacts/default/messages',
    payload: { to: 'anon-cobra-3e910000', content: 'hi' },
  })
  t.is(res.statusCode, 200)
})

test('POST /v1/messages: invalid handle returns 400', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const res = await app.inject({
    method: 'POST',
    url: '/v1/pacts/default/messages',
    payload: { to: 'NotAHandle', content: 'hi' },
  })
  t.is(res.statusCode, 400)
})

test('GET /v1/messages: since cursor filters', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  await app.inject({
    method: 'POST',
    url: '/v1/pacts/default/messages',
    payload: { to: '*', content: 'first' },
  })
  await new Promise((r) => setTimeout(r, 5))
  const cutoff = new Date().toISOString()
  await new Promise((r) => setTimeout(r, 5))
  await app.inject({
    method: 'POST',
    url: '/v1/pacts/default/messages',
    payload: { to: '*', content: 'second' },
  })
  await daemon.update()
  await daemon.waitForViewVersion(2, { timeout: 2000 })

  const res = await app.inject({ method: 'GET', url: `/v1/pacts/default/messages?since=${cutoff}` })
  const body = JSON.parse(res.body)
  t.is(body.entries.length, 1)
  t.is(body.entries[0].payload.content, 'second')
})

test('GET /v1/messages: filter by recipient', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  await app.inject({
    method: 'POST',
    url: '/v1/pacts/default/messages',
    payload: { to: '*', content: 'broadcast' },
  })
  await app.inject({
    method: 'POST',
    url: '/v1/pacts/default/messages',
    payload: { to: 'anon-cobra-3e910000', content: 'direct' },
  })
  await daemon.update()
  await daemon.waitForViewVersion(2, { timeout: 2000 })

  const res = await app.inject({
    method: 'GET',
    url: '/v1/pacts/default/messages?to=anon-cobra-3e910000',
  })
  const body = JSON.parse(res.body)
  t.is(body.entries.length, 1)
  t.is(body.entries[0].payload.content, 'direct')
})
