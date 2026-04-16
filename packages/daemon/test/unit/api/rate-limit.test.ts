import test from 'brittle'
import { createApi } from '../../../src/api'
import { tmpDaemon } from '../../helpers/tmp-daemon'

test('rate-limit: trips 429 + RATE_LIMITED envelope after quota', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon, {
    rateLimit: { max: 3, windowMs: 60_000 },
  })
  t.teardown(() => app.close())

  for (let i = 0; i < 3; i++) {
    const res = await app.inject({ method: 'GET', url: '/v1/ping' })
    t.is(res.statusCode, 200, `request ${i + 1} succeeds`)
  }
  const denied = await app.inject({ method: 'GET', url: '/v1/ping' })
  t.is(denied.statusCode, 429)
  const body = JSON.parse(denied.body)
  t.is(body.status, 429)
  t.is(body.error, 'RATE_LIMITED')
  t.ok(/retry in \d+s/.test(body.message))
})

test('rate-limit: max=0 disables the plugin entirely', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon, { rateLimit: { max: 0 } })
  t.teardown(() => app.close())

  for (let i = 0; i < 20; i++) {
    const res = await app.inject({ method: 'GET', url: '/v1/ping' })
    t.is(res.statusCode, 200)
  }
})

test('rate-limit: /v1/events bypasses the global policy', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon, {
    rateLimit: { max: 2, windowMs: 60_000 },
  })
  t.teardown(() => app.close())

  // Burn the global quota first.
  await app.inject({ method: 'GET', url: '/v1/ping' })
  await app.inject({ method: 'GET', url: '/v1/ping' })
  const blocked = await app.inject({ method: 'GET', url: '/v1/ping' })
  t.is(blocked.statusCode, 429)

  // SSE route is exempt — it still returns a 200 text/event-stream
  // header even after the generic quota is exhausted. We abort the
  // connection immediately; otherwise inject() would block waiting
  // on the keep-alive heartbeat.
  const sse = await app.inject({
    method: 'GET',
    url: '/v1/events',
    payloadAsStream: true,
  })
  t.is(sse.statusCode, 200)
  t.ok(sse.headers['content-type']?.toString().includes('text/event-stream'))
  sse.stream().destroy()
})
