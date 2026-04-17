/**
 * /v1/healthz + /v1/readyz + /v1/metrics endpoints.
 *
 *   - /v1/healthz always returns 200 once the HTTP listener is up.
 *     It is auth-exempt (PUBLIC_PATHS) so supervisors/probes don't
 *     need the bearer token.
 *   - /v1/readyz returns 503 until at least one pact is loaded; 200
 *     once the daemon has been started and a default pact is ready.
 *   - /v1/metrics renders Prometheus text with the core gauges the
 *     daemon publishes. We only assert on a handful of names; the
 *     full label set is exercised indirectly by parsing.
 */
import test from 'brittle'
import { tmpDaemon } from '../../helpers/tmp-daemon'
import { createApi, bind } from '../../../src/api'

let nextPort = 24000

test('GET /v1/healthz is 200 + public', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon, { token: 'secret' })
  const port = nextPort++
  await bind(app, { host: '127.0.0.1', port })
  t.teardown(() => app.close())

  // No Authorization header — /v1/healthz must still succeed.
  const res = await fetch(`http://127.0.0.1:${port}/v1/healthz`)
  const txt = await res.text()
  t.is(res.status, 200, `unexpected status ${res.status}: ${txt}`)
  const body = JSON.parse(txt) as { ok: boolean; status: string }
  t.is(body.ok, true)
  t.is(body.status, 'alive')
})

test('GET /v1/readyz is 200 with at least one pact, 503 otherwise', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon, { token: 'secret' })
  const port = nextPort++
  await bind(app, { host: '127.0.0.1', port })
  t.teardown(() => app.close())

  // tmpDaemon creates a default pact via Daemon.create → listPacts
  // should return one entry without needing daemon.start(). readyz
  // must honour that.
  const res = await fetch(`http://127.0.0.1:${port}/v1/readyz`)
  t.is(res.status, 200, 'daemon with a registered pact is ready')
  const body = (await res.json()) as {
    ok: boolean
    status: string
    pact_count: number
  }
  t.is(body.ok, true)
  t.is(body.status, 'ready')
  t.is(body.pact_count >= 1, true, 'pact_count reported')
})

test('GET /v1/metrics returns Prometheus text with core gauges', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon, { token: 'secret' })
  const port = nextPort++
  await bind(app, { host: '127.0.0.1', port })
  t.teardown(() => app.close())

  // Metrics stays auth-gated. A probe without the bearer should 401.
  const unauth = await fetch(`http://127.0.0.1:${port}/v1/metrics`)
  t.is(unauth.status, 401, 'metrics requires auth')

  const res = await fetch(`http://127.0.0.1:${port}/v1/metrics`, {
    headers: { authorization: 'Bearer secret' },
  })
  t.is(res.status, 200)
  t.ok(
    (res.headers.get('content-type') ?? '').startsWith('text/plain'),
    'metrics content-type is text/plain',
  )
  const body = await res.text()
  for (const name of [
    'openpact_process_uptime_seconds',
    'openpact_process_resident_memory_bytes',
    'openpact_pacts_total',
    'openpact_agents_connected',
    'openpact_sse_backpressure_closes_total',
    'openpact_pact_view_version',
    'openpact_pact_is_indexer',
  ]) {
    t.ok(body.includes(`# HELP ${name}`), `${name} HELP present`)
    t.ok(body.includes(`# TYPE ${name}`), `${name} TYPE present`)
  }
})
