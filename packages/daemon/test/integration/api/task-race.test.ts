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

async function putJson(url: string, body: unknown = {}): Promise<{ status: number; body: any }> {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json() }
}

async function getJson(url: string): Promise<{ status: number; body: any }> {
  const res = await fetch(url)
  return { status: res.status, body: await res.json() }
}

async function waitForTask(url: string, taskId: string, timeout = 15000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const res = await getJson(`${url}/v1/tasks/${taskId}`)
    if (res.status === 200) return res.body
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`waitForTask(${taskId}) timeout`)
}

test('two writers concurrently claim same task; eventual single winner', async (t) => {
  const { a, b } = await pair(t)
  const apiA = await bootApi(t, a.daemon)
  const apiB = await bootApi(t, b.daemon)

  const created = await postJson(`${apiA}/v1/tasks`, { title: 'race me' })
  t.is(created.status, 200)
  const taskId = created.body.id as string

  await a.daemon.addWriter(b.daemon.publicKey!, { indexer: false })
  await b.daemon.waitForWritable({ timeout: 30000 })
  await waitForTask(apiB, taskId)

  // Race: both try to claim simultaneously. With optimistic claiming,
  // both may transiently return 200 — the resolution is the eventual
  // deterministic state.
  const [resA, resB] = await Promise.all([
    putJson(`${apiA}/v1/tasks/${taskId}/claim`),
    putJson(`${apiB}/v1/tasks/${taskId}/claim`),
  ])

  // At least one must have succeeded; both 200 is allowed (race window).
  t.ok(resA.status === 200 || resB.status === 200, 'at least one claim succeeded')

  // After sync, both daemons MUST agree on a single winner — that's the
  // load-bearing invariant. The deterministic reducer picks the
  // lexicographically earliest entry-id as the canonical claimer.
  await new Promise((r) => setTimeout(r, 500))
  await a.daemon.update()
  await b.daemon.update()
  const fromA = await getJson(`${apiA}/v1/tasks/${taskId}`)
  const fromB = await getJson(`${apiB}/v1/tasks/${taskId}`)
  t.is(fromA.body.status, 'claimed', 'A sees claimed')
  t.is(fromB.body.status, 'claimed', 'B sees claimed')
  t.is(fromA.body.claimed_by, fromB.body.claimed_by, 'A and B agree on the winner')

  // A subsequent claim by anyone returns 409 — task is no longer open.
  const retry = await putJson(`${apiA}/v1/tasks/${taskId}/claim`)
  t.is(retry.status, 409)
  t.is(retry.body.error, 'TASK_NOT_OPEN')
})
