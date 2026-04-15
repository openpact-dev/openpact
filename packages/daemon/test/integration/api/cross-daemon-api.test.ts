import test from 'brittle'
import { createApi, bind } from '../../../src/api'
import { pair } from '../../helpers/pair'
import type { Daemon } from '../../../src/daemon'

async function bootApi(t: any, daemon: Daemon): Promise<string> {
  const app = createApi(daemon)
  const url = await bind(app, { host: '127.0.0.1', port: 0 })
  t.teardown(() => app.close())
  return url
}

async function postJson(url: string, body: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json() }
}

async function getJson(url: string): Promise<{ status: number; body: any }> {
  const res = await fetch(url)
  return { status: res.status, body: await res.json() }
}

test('POST knowledge to A; GET knowledge on B sees it', async (t) => {
  const { a, b } = await pair(t)
  const apiA = await bootApi(t, a.daemon)
  const apiB = await bootApi(t, b.daemon)

  const post = await postJson(`${apiA}/v1/pacts/default/knowledge`, {
    topic: 'sales',
    content: 'cross-daemon flow works',
  })
  t.is(post.status, 200)

  const deadline = Date.now() + 15000
  let entries: any[] = []
  while (Date.now() < deadline) {
    await b.daemon.update()
    const res = await getJson(`${apiB}/v1/pacts/default/knowledge?topic=sales`)
    entries = res.body
    if (entries.length >= 1) break
    await new Promise((r) => setTimeout(r, 100))
  }
  t.is(entries.length, 1, 'B sees the entry over the API')
  t.is(entries[0].payload.content, 'cross-daemon flow works')
  t.is(entries[0].agent_id, a.daemon.peerHandle)
})

test('GET status on B reflects entries written via A', async (t) => {
  const { a, b } = await pair(t)
  const apiA = await bootApi(t, a.daemon)
  const apiB = await bootApi(t, b.daemon)

  await postJson(`${apiA}/v1/pacts/default/knowledge`, { topic: 't', content: '1' })

  const deadline = Date.now() + 15000
  let entries = 0
  while (Date.now() < deadline) {
    await b.daemon.update()
    const res = await getJson(`${apiB}/v1/pacts/default/status`)
    entries = res.body.entries
    if (entries > 0) break
    await new Promise((r) => setTimeout(r, 100))
  }
  t.ok(entries > 0)
})
