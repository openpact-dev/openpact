import test from 'brittle'
import { createApi } from '../../../src/api'
import { tmpDaemon } from '../../helpers/tmp-daemon'

test('GET /v1/status returns the host-level summary', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const res = await app.inject({ method: 'GET', url: '/v1/status' })
  t.is(res.statusCode, 200)
  const body = JSON.parse(res.body)

  t.is(body.current, 'default', 'currentAlias is the default pact')
  t.is(body.pact_count, 1)
  t.is(typeof body.agents, 'number')
})

test('GET /v1/pacts/:pactId/status returns the fat per-pact payload', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const res = await app.inject({ method: 'GET', url: '/v1/pacts/default/status' })
  t.is(res.statusCode, 200)
  const body = JSON.parse(res.body)

  t.ok(typeof body.pact_id === 'string')
  t.ok(/^anon-[a-z]+-[0-9a-f]{8}$/.test(body.peer_handle))
  t.is(body.role, 'creator')
  t.is(body.agents, 0)
  t.is(typeof body.entries, 'number')
  t.is(body.is_member, true)
})

test('GET /v1/pacts/:pactId/status agents is pact-scoped, not host-wide', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())
  ;(daemon as any)._swarm = { connections: new Set([1, 2, 3]), destroy: async () => {} }
  ;(daemon as any).onlineMembers = () => new Set(['a'.repeat(64)])

  const host = JSON.parse((await app.inject({ method: 'GET', url: '/v1/status' })).body)
  const pact = JSON.parse(
    (await app.inject({ method: 'GET', url: '/v1/pacts/default/status' })).body,
  )

  t.is(host.agents, 3, 'host status reports all swarm connections')
  t.is(pact.agents, 1, 'pact status reports only authenticated members for that pact')
})

test('GET /v1/pacts/:pactId/status entries reflects appends', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const before = JSON.parse(
    (await app.inject({ method: 'GET', url: '/v1/pacts/default/status' })).body,
  )

  await daemon.append({
    type: 'knowledge',
    timestamp: new Date().toISOString(),
    agent_id: daemon.peerHandle!,
    payload: { topic: 'x', content: 'y' },
  })
  await daemon.update()
  await daemon.waitForViewVersion(1, { timeout: 2000 })

  const after = JSON.parse(
    (await app.inject({ method: 'GET', url: '/v1/pacts/default/status' })).body,
  )
  t.ok(after.entries > before.entries)
})

test('GET /v1/pacts/unknown/status returns 404 UNKNOWN_PACT', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const res = await app.inject({ method: 'GET', url: '/v1/pacts/does-not-exist/status' })
  t.is(res.statusCode, 404)
  t.is(JSON.parse(res.body).error, 'UNKNOWN_PACT')
})
