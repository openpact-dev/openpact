import test from 'brittle'
import { createApi } from '../../../src/api'
import { tmpDaemon } from '../../helpers/tmp-daemon'

async function inject(app: any, url: string): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'GET', url })
  return { status: res.statusCode, body: JSON.parse(res.body) }
}

async function post(app: any, url: string, payload: unknown): Promise<any> {
  const res = await app.inject({ method: 'POST', url, payload })
  if (res.statusCode !== 200) throw new Error(`${url} failed: ${res.statusCode} ${res.body}`)
  return JSON.parse(res.body)
}

test('GET /v1/changes: empty pact + wait=0 returns empty page', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const { status, body } = await inject(app, '/v1/pacts/default/changes?wait=0')
  t.is(status, 200)
  t.alike(body.entries, [])
  t.is(body.cursor, null)
  t.is(body.has_more, false)
})

test('GET /v1/changes?from=head: empty pact returns null cursor, no entries', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const { status, body } = await inject(app, '/v1/pacts/default/changes?from=head')
  t.is(status, 200)
  t.alike(body.entries, [])
  t.is(body.cursor, null)
  t.is(body.has_more, false)
})

test('GET /v1/changes?from=head: populated pact returns cursor pinned at head', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  await post(app, '/v1/pacts/default/knowledge', { topic: 'routing', content: 'first' })
  await post(app, '/v1/pacts/default/messages', { content: 'second' })
  await post(app, '/v1/pacts/default/tasks', { title: 'third' })
  await daemon.update()

  const head = (await inject(app, '/v1/pacts/default/changes?from=head')).body
  t.alike(head.entries, [], 'from=head returns no entries, just the cursor')
  t.ok(typeof head.cursor === 'string' && head.cursor.includes('|'))

  // A subsequent poll with since=<head>&wait=0 must return nothing —
  // head is past everything.
  const empty = (
    await inject(app, `/v1/pacts/default/changes?since=${encodeURIComponent(head.cursor)}&wait=0`)
  ).body
  t.is(empty.entries.length, 0)

  // A new write lands ahead of the head cursor.
  const k = await post(app, '/v1/pacts/default/knowledge', { topic: 'routing', content: 'fourth' })
  await daemon.update()

  const next = (
    await inject(app, `/v1/pacts/default/changes?since=${encodeURIComponent(head.cursor)}&wait=0`)
  ).body
  t.is(next.entries.length, 1)
  t.is(next.entries[0].id, k.id)
})

test('GET /v1/changes?from=head&type=task: head respects the type filter', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  // A message is written AFTER the task; the head-of-tasks cursor
  // must still pin at the task, not the message.
  const taskRes = await post(app, '/v1/pacts/default/tasks', { title: 't' })
  await post(app, '/v1/pacts/default/messages', { content: 'm' })
  await daemon.update()

  const head = (await inject(app, '/v1/pacts/default/changes?from=head&type=task')).body
  t.ok(head.cursor?.endsWith(`|${taskRes.id}`), `head cursor pins at task id: ${head.cursor}`)
})

test('GET /v1/changes: returns entries across types in chronological order', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  await post(app, '/v1/pacts/default/knowledge', { topic: 'routing', content: 'A' })
  await post(app, '/v1/pacts/default/messages', { content: 'hi' })
  await post(app, '/v1/pacts/default/tasks', { title: 'do it' })
  await daemon.update()

  const { status, body } = await inject(app, '/v1/pacts/default/changes')
  t.is(status, 200)
  t.is(body.entries.length, 3)
  const types = body.entries.map((e: any) => e.type)
  t.alike(types.sort(), ['knowledge', 'message', 'task'])
  // Sorted ascending by timestamp.
  for (let i = 1; i < body.entries.length; i++) {
    t.ok(body.entries[i - 1].timestamp <= body.entries[i].timestamp, 'chronological')
  }
  t.ok(typeof body.cursor === 'string' && body.cursor.includes('|'))
})

test('GET /v1/changes: since cursor advances past already-seen entries', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  await post(app, '/v1/pacts/default/knowledge', { topic: 'a', content: 'first' })
  await post(app, '/v1/pacts/default/knowledge', { topic: 'a', content: 'second' })
  await daemon.update()

  const first = (await inject(app, '/v1/pacts/default/changes?limit=1')).body
  t.is(first.entries.length, 1)
  t.is(first.has_more, true)

  const next = (
    await inject(app, `/v1/pacts/default/changes?since=${encodeURIComponent(first.cursor)}`)
  ).body
  t.is(next.entries.length, 1)
  t.is(next.entries[0].payload.content, 'second')
  t.is(next.has_more, false)
})

test('GET /v1/changes: type filter restricts to one entry type', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  await post(app, '/v1/pacts/default/knowledge', { topic: 'a', content: 'A' })
  await post(app, '/v1/pacts/default/messages', { content: 'hi' })
  await daemon.update()

  const { body } = await inject(app, '/v1/pacts/default/changes?type=knowledge')
  t.is(body.entries.length, 1)
  t.is(body.entries[0].type, 'knowledge')
})

test('GET /v1/changes: unknown type rejected at schema level', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const { status, body } = await inject(app, '/v1/pacts/default/changes?type=admin')
  t.is(status, 400)
  t.is(body.error, 'BAD_REQUEST')
})

test('GET /v1/changes: malformed cursor returns 400 BAD_CURSOR', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const { status, body } = await inject(app, '/v1/pacts/default/changes?since=nope')
  t.is(status, 400)
  t.is(body.error, 'BAD_CURSOR')
})

test('GET /v1/changes?wait=N: resolves when a new entry lands during the wait', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  // Seed + drain once so we know the cursor is "at the head".
  await post(app, '/v1/pacts/default/knowledge', { topic: 'a', content: 'first' })
  await daemon.update()
  const seed = (await inject(app, '/v1/pacts/default/changes')).body
  t.ok(typeof seed.cursor === 'string')

  // Kick off the long-poll.
  const waitStart = Date.now()
  const waiting = inject(
    app,
    `/v1/pacts/default/changes?since=${encodeURIComponent(seed.cursor)}&wait=5`,
  )

  // Give the request a tick to register its listener before we publish.
  setTimeout(async () => {
    await post(app, '/v1/pacts/default/messages', { content: 'wake up' })
    // Force autobase to apply the just-appended entry — under inject()
    // there's no incoming swarm tick to drive it. In production the
    // indexer loop runs continuously so this is only a test-scaffold
    // concern.
    await daemon.update()
  }, 40)

  const { body } = await waiting
  const elapsed = Date.now() - waitStart
  t.is(body.entries.length, 1)
  t.is(body.entries[0].type, 'message')
  t.is(body.entries[0].payload.content, 'wake up')
  t.ok(elapsed < 2000, `woke up before the 5s deadline (took ${elapsed}ms)`)
})

test('GET /v1/changes?wait=1: returns empty after the wait window elapses', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  const app = createApi(daemon)
  t.teardown(() => app.close())

  const waitStart = Date.now()
  const { body } = await inject(app, '/v1/pacts/default/changes?wait=1')
  const elapsed = Date.now() - waitStart
  t.alike(body.entries, [])
  t.ok(elapsed >= 900, `actually waited ~1s (took ${elapsed}ms)`)
  t.ok(elapsed < 2500, 'did not hang past the window')
})
