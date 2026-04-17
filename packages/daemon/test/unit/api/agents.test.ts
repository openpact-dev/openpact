import test from 'brittle'
import { createApi } from '../../../src/api'
import { tmpDaemon } from '../../helpers/tmp-daemon'

test('GET /v1/pacts/:pactId/agents returns the self row for a fresh pact', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const res = await app.inject({ method: 'GET', url: '/v1/pacts/default/agents' })
  t.is(res.statusCode, 200)
  const body = JSON.parse(res.body)
  t.is(body.length, 1, 'only the local peer is in the ledger before any joins')
  t.is(body[0].is_self, true, 'self is flagged')
  t.is(body[0].role, 'creator', 'self is the creator of a freshly-initialized pact')
  t.is(body[0].online, true, 'self is always online from its own vantage')
  t.ok(/^anon-[a-z]+-[0-9a-f]{8}$/.test(body[0].id), 'id is the local peer handle')
})

test('GET /v1/pacts/:pactId/agents?online=true keeps self (always online)', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const res = await app.inject({ method: 'GET', url: '/v1/pacts/default/agents?online=true' })
  t.is(res.statusCode, 200)
  const body = JSON.parse(res.body)
  t.is(body.length, 1)
  t.is(body[0].online, true)
})

test('GET /v1/pacts/:pactId/agents?online=false excludes the self row', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const res = await app.inject({ method: 'GET', url: '/v1/pacts/default/agents?online=false' })
  t.is(res.statusCode, 200)
  t.alike(JSON.parse(res.body), [])
})

test('GET /v1/pacts/:pactId/agents?online=nonsense returns 400', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const res = await app.inject({ method: 'GET', url: '/v1/pacts/default/agents?online=maybe' })
  t.is(res.statusCode, 400)
})
