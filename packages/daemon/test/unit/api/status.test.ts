import test from 'brittle'
import { createApi } from '../../../src/api'
import { tmpDaemon } from '../../helpers/tmp-daemon'

test('GET /v1/status returns the expected shape', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const res = await app.inject({ method: 'GET', url: '/v1/status' })
  t.is(res.statusCode, 200)
  const body = JSON.parse(res.body)

  t.ok(typeof body.pact_id === 'string')
  t.ok(/^anon-[a-z]+-[0-9a-f]{4}$/.test(body.peer_handle))
  t.is(body.role, 'creator')
  t.is(body.peers, 0)
  t.is(typeof body.entries, 'number')
  t.is(body.is_writer, true)
})

test('GET /v1/status entries reflects appends', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const before = JSON.parse((await app.inject({ method: 'GET', url: '/v1/status' })).body)

  await daemon.append({
    type: 'knowledge',
    timestamp: new Date().toISOString(),
    agent_id: daemon.peerHandle!,
    payload: { topic: 'x', content: 'y' },
  })
  await daemon.update()
  await daemon.waitForViewVersion(1, { timeout: 2000 })

  const after = JSON.parse((await app.inject({ method: 'GET', url: '/v1/status' })).body)
  t.ok(after.entries > before.entries)
})
