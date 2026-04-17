import test from 'brittle'
import { createApi } from '../../../src/api'
import { tmpDaemon } from '../../helpers/tmp-daemon'

test('POST /v1/messages: broadcast echoes the created message entry', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const res = await app.inject({
    method: 'POST',
    url: '/v1/pacts/default/messages',
    payload: { content: 'heads up' },
  })
  t.is(res.statusCode, 200)
  const body = JSON.parse(res.body)
  t.ok(typeof body.id === 'string')
  t.is(body.type, 'message')
  t.is(body.agent_id, daemon.peerHandle)
  t.is(body.payload.content, 'heads up')
  t.ok(typeof body.timestamp === 'string')
})

test('POST /v1/messages: legacy `to` field is silently dropped (broadcast-only semantics)', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  // The `to` field used to label messages with a recipient handle. It's
  // gone now — every message is a pact-wide broadcast. Fastify's default
  // Ajv config removes additional properties before the handler runs,
  // so a stale caller still posts successfully and the field never
  // lands in the ledger.
  const post = await app.inject({
    method: 'POST',
    url: '/v1/pacts/default/messages',
    payload: { to: 'anon-cobra-3e910000', content: 'hi' },
  })
  t.is(post.statusCode, 200)

  await daemon.update()
  await daemon.waitForViewVersion(1, { timeout: 2000 })
  const list = await app.inject({ method: 'GET', url: '/v1/pacts/default/messages' })
  const entries = JSON.parse(list.body).entries
  t.is(entries.length, 1)
  t.is(entries[0].payload.content, 'hi')
  t.is(entries[0].payload.to, undefined, 'stripped before storage')
})

test('POST /v1/messages: empty content returns 400', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const res = await app.inject({
    method: 'POST',
    url: '/v1/pacts/default/messages',
    payload: { content: '' },
  })
  t.is(res.statusCode, 400)
})

test('POST /v1/messages: reply_to hoists onto refs + reverse-ref index', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const parent = await app.inject({
    method: 'POST',
    url: '/v1/pacts/default/messages',
    payload: { content: 'original' },
  })
  const parentId = JSON.parse(parent.body).id

  const reply = await app.inject({
    method: 'POST',
    url: '/v1/pacts/default/messages',
    payload: { content: 'reply', reply_to: parentId },
  })
  t.is(reply.statusCode, 200)
  const replyBody = JSON.parse(reply.body)
  t.alike(replyBody.refs, [parentId])
  t.is(replyBody.payload.reply_to, undefined, 'reply_to hoisted, not persisted in payload')

  await daemon.update()
  await daemon.waitForViewVersion(2, { timeout: 2000 })

  const threads = await app.inject({
    method: 'GET',
    url: `/v1/pacts/default/entries/${parentId}/referenced-by`,
  })
  const threadBody = JSON.parse(threads.body)
  t.is(threadBody.length, 1)
  t.is(threadBody[0].payload.content, 'reply')
})

test('POST /v1/messages: malformed reply_to returns 400', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const res = await app.inject({
    method: 'POST',
    url: '/v1/pacts/default/messages',
    payload: { content: 'reply', reply_to: 'not-an-id' },
  })
  t.is(res.statusCode, 400)
  t.is(JSON.parse(res.body).error, 'BAD_REQUEST')
})

test('GET /v1/messages: since cursor filters', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  await app.inject({
    method: 'POST',
    url: '/v1/pacts/default/messages',
    payload: { content: 'first' },
  })
  await new Promise((r) => setTimeout(r, 5))
  const cutoff = new Date().toISOString()
  await new Promise((r) => setTimeout(r, 5))
  await app.inject({
    method: 'POST',
    url: '/v1/pacts/default/messages',
    payload: { content: 'second' },
  })
  await daemon.update()
  await daemon.waitForViewVersion(2, { timeout: 2000 })

  const res = await app.inject({ method: 'GET', url: `/v1/pacts/default/messages?since=${cutoff}` })
  const body = JSON.parse(res.body)
  t.is(body.entries.length, 1)
  t.is(body.entries[0].payload.content, 'second')
})
