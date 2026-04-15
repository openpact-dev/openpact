/**
 * GET /v1/entries/:id and GET /v1/entries/:id/referenced-by.
 *
 * The :id route does a cross-type lookup (knowledge | task | skill |
 * message) so the dashboard's Trace screen can resolve any entry by
 * its short id without knowing its type up front.
 *
 * The /referenced-by route reads the reverse-ref index that apply.ts
 * writes (covered separately in apply/ref-index.test.ts).
 */
import test from 'brittle'
import { createApi } from '../../../src/api'
import { tmpDaemon } from '../../helpers/tmp-daemon'

async function bootApi(t: any) {
  const { daemon } = await tmpDaemon(t)
  const app = createApi(daemon)
  t.teardown(() => app.close())
  return { app, daemon }
}

test('GET /v1/entries/:id returns the full entry across any type', async (t) => {
  const { app } = await bootApi(t)
  const create = await app.inject({
    method: 'POST',
    url: '/v1/knowledge',
    payload: { topic: 'wiring', content: 'cross-type-lookup-works' },
  })
  const { id } = JSON.parse(create.body)

  const res = await app.inject({ method: 'GET', url: `/v1/entries/${id}` })
  t.is(res.statusCode, 200)
  const body = JSON.parse(res.body)
  t.is(body.id, id)
  t.is(body.type, 'knowledge')
  t.is(body.payload.content, 'cross-type-lookup-works')
})

test('GET /v1/entries/:id returns 404 NOT_FOUND for unknown id', async (t) => {
  const { app } = await bootApi(t)
  const res = await app.inject({ method: 'GET', url: '/v1/entries/zzzz-99' })
  t.is(res.statusCode, 404)
  t.is(JSON.parse(res.body).error, 'NOT_FOUND')
})

test('GET /v1/entries/:id/referenced-by returns entries that ref this one', async (t) => {
  const { app, daemon } = await bootApi(t)

  // Seed an original task, then a claim entry (which refs the task).
  // Use the daemon's append directly so we control the refs field.
  const original = await daemon.append({
    type: 'task',
    timestamp: new Date().toISOString(),
    agent_id: daemon.peerHandle!,
    payload: { title: 'race', status: 'open' },
  })
  await daemon.append({
    type: 'task',
    timestamp: new Date().toISOString(),
    agent_id: daemon.peerHandle!,
    refs: [original.id],
    payload: { title: 'race', status: 'claimed', claimed_by: daemon.peerHandle },
  })

  const res = await app.inject({
    method: 'GET',
    url: `/v1/entries/${original.id}/referenced-by`,
  })
  t.is(res.statusCode, 200)
  const arr = JSON.parse(res.body) as any[]
  t.is(arr.length, 1, 'one entry references the original')
  t.is(arr[0].payload.status, 'claimed')
})

test('GET /v1/entries/:id/referenced-by returns [] for an entry with no incoming refs', async (t) => {
  const { app } = await bootApi(t)
  const create = await app.inject({
    method: 'POST',
    url: '/v1/knowledge',
    payload: { topic: 'lonely', content: 'no one references this' },
  })
  const { id } = JSON.parse(create.body)

  const res = await app.inject({ method: 'GET', url: `/v1/entries/${id}/referenced-by` })
  t.is(res.statusCode, 200)
  t.alike(JSON.parse(res.body), [])
})
