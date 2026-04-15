/**
 * POST /v1/admin/promote and POST /v1/admin/remove — dashboard-flavoured
 * wrappers around addWriter/removeWriter. Gated on
 * daemon.role === 'creator' and require explicit { confirm: true }.
 *
 * The trust boundary is the loopback interface; these checks are
 * belt-and-braces UI gating, not auth.
 */
import test from 'brittle'
import { createApi } from '../../../src/api'
import { tmpDaemon } from '../../helpers/tmp-daemon'

const KEY_B = 'bb'.repeat(32)

async function bootApi(t: any, opts: any = {}) {
  // No swarm needed for in-process route tests; skip start to save ~1s/test.
  const { daemon } = await tmpDaemon(t, { start: false, ...opts })
  const app = createApi(daemon)
  t.teardown(() => app.close())
  return { app, daemon }
}

test('promote: missing { confirm: true } returns 400 NOT_CONFIRMED', async (t) => {
  const { app } = await bootApi(t)
  const res = await app.inject({
    method: 'POST',
    url: '/v1/admin/promote',
    payload: { key: KEY_B },
  })
  // Schema validation rejects missing required field with 400.
  t.is(res.statusCode, 400)
})

test('promote: confirm: false returns 400 NOT_CONFIRMED', async (t) => {
  const { app } = await bootApi(t)
  const res = await app.inject({
    method: 'POST',
    url: '/v1/admin/promote',
    payload: { key: KEY_B, confirm: false },
  })
  t.is(res.statusCode, 400)
  t.is(JSON.parse(res.body).error, 'NOT_CONFIRMED')
})

test('promote: bad-format key is rejected by schema', async (t) => {
  const { app } = await bootApi(t)
  const res = await app.inject({
    method: 'POST',
    url: '/v1/admin/promote',
    payload: { key: 'not-hex', confirm: true },
  })
  t.is(res.statusCode, 400)
})

test('promote: from a creator daemon succeeds', async (t) => {
  // The creator role is set by Daemon.create (default in tmpDaemon).
  const { app } = await bootApi(t)
  const res = await app.inject({
    method: 'POST',
    url: '/v1/admin/promote',
    payload: { key: KEY_B, confirm: true },
  })
  t.is(res.statusCode, 200)
  const body = JSON.parse(res.body)
  t.is(body.ok, true)
  t.is(body.key, KEY_B)
  t.is(body.indexer, true)
})

test('remove: from a creator daemon succeeds', async (t) => {
  const { app } = await bootApi(t)
  // Promote first so removal isn't a no-op edge case (still tests the route).
  await app.inject({
    method: 'POST',
    url: '/v1/admin/promote',
    payload: { key: KEY_B, confirm: true },
  })
  const res = await app.inject({
    method: 'POST',
    url: '/v1/admin/remove',
    payload: { key: KEY_B, confirm: true },
  })
  t.is(res.statusCode, 200)
  const body = JSON.parse(res.body)
  t.is(body.ok, true)
  t.is(body.key, KEY_B)
})

test('promote: non-creator daemon (reader) returns 409 NOT_INDEXER', async (t) => {
  // Manually construct a daemon with role 'reader' to exercise the gate.
  // The simpler route: the existing tmpDaemon defaults to creator;
  // override `role` directly on the instance for this assertion.
  const { app, daemon } = await bootApi(t)
  ;(daemon as any)._role = 'reader'

  const res = await app.inject({
    method: 'POST',
    url: '/v1/admin/promote',
    payload: { key: KEY_B, confirm: true },
  })
  t.is(res.statusCode, 409)
  t.is(JSON.parse(res.body).error, 'NOT_INDEXER')
})

test('remove: non-creator daemon (reader) returns 409 NOT_INDEXER', async (t) => {
  const { app, daemon } = await bootApi(t)
  ;(daemon as any)._role = 'reader'

  const res = await app.inject({
    method: 'POST',
    url: '/v1/admin/remove',
    payload: { key: KEY_B, confirm: true },
  })
  t.is(res.statusCode, 409)
  t.is(JSON.parse(res.body).error, 'NOT_INDEXER')
})
