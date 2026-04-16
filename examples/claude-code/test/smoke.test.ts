/**
 * Smoke-test the curl recipes documented in CLAUDE.md against a real,
 * in-process daemon on an ephemeral port. If a recipe drifts from
 * what the daemon accepts, this test catches it before the doc rots.
 *
 * Each `curl(...)` call below mirrors a recipe in CLAUDE.md verbatim
 * (just split into argv form to avoid a shell). The final assertion
 * applies the documented jq projection in-process so the test stays
 * portable even when jq is unavailable in CI.
 */
import test from 'brittle'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { Daemon, createApi, bind } from '@openpact/daemon'

const run = promisify(execFile)

let nextPort = 19800

interface Env {
  base: string
}

async function bootDaemon(t: any): Promise<Env> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openpact-cc-'))
  const daemon = await Daemon.create({ dataDir: dir })
  // await daemon.start() — skipped: no swarm needed for HTTP-only tests
  const app = createApi(daemon)
  const port = nextPort++
  await bind(app, { host: '127.0.0.1', port })
  t.teardown(async () => {
    await app.close()
    await daemon.stop()
    await fs.rm(dir, { recursive: true, force: true })
  })
  return { base: `http://127.0.0.1:${port}` }
}

async function curl(...args: string[]): Promise<string> {
  const { stdout } = await run('curl', args)
  return stdout
}

async function waitFor<T>(
  fn: () => Promise<T>,
  ok: (v: T) => boolean,
  timeoutMs = 3000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs
  let last: T
  while (Date.now() < deadline) {
    last = await fn()
    if (ok(last)) return last
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error('waitFor timeout; last value: ' + JSON.stringify(last!))
}

test('CLAUDE.md curl recipes work end-to-end against the daemon', async (t) => {
  const { base } = await bootDaemon(t)

  // ping
  const ping = JSON.parse(await curl('-sf', `${base}/v1/ping`))
  t.alike(ping, { ok: true })

  // record knowledge
  const created = JSON.parse(
    await curl(
      '-sf',
      '-X',
      'POST',
      `${base}/v1/pacts/default/knowledge`,
      '-H',
      'content-type: application/json',
      '-d',
      JSON.stringify({
        topic: 'routing',
        content: 'Use the resolver factory in src/router.ts.',
        confidence: 0.9,
      }),
    ),
  )
  t.ok(/^[0-9a-f]{4}-\d+$/.test(created.id), 'returns id in <core>-<seq> format')

  // list filtered by topic — wait for view
  const list = await waitFor(
    async () =>
      JSON.parse(await curl('-sf', `${base}/v1/pacts/default/knowledge?topic=routing&limit=20`))
        .entries,
    (arr: any[]) => Array.isArray(arr) && arr.length >= 1,
  )
  t.is(list[0].payload.topic, 'routing')
  t.is(list[0].payload.content, 'Use the resolver factory in src/router.ts.')

  // post task
  const task = JSON.parse(
    await curl(
      '-sf',
      '-X',
      'POST',
      `${base}/v1/pacts/default/tasks`,
      '-H',
      'content-type: application/json',
      '-d',
      JSON.stringify({
        title: 'Migrate auth middleware off legacy session store',
        description: 'details in CLAUDE.md',
      }),
    ),
  )
  const taskId = task.id

  // list open tasks
  await waitFor(
    async () => JSON.parse(await curl('-sf', `${base}/v1/pacts/default/tasks?status=open`)).entries,
    (arr: any[]) => arr.some((tt) => tt.id === taskId),
  )

  // claim
  const claimed = JSON.parse(
    await curl('-sf', '-X', 'PUT', `${base}/v1/pacts/default/tasks/${taskId}/claim`),
  )
  t.is(claimed.task.status, 'claimed')

  // complete
  const completed = JSON.parse(
    await curl(
      '-sf',
      '-X',
      'PUT',
      `${base}/v1/pacts/default/tasks/${taskId}/complete`,
      '-H',
      'content-type: application/json',
      '-d',
      JSON.stringify({ result: 'PR #123 merged' }),
    ),
  )
  t.is(completed.task.status, 'complete')
  t.is(completed.task.result, 'PR #123 merged')

  // broadcast message
  const cutoff = new Date().toISOString()
  await new Promise((r) => setTimeout(r, 5))
  await curl(
    '-sf',
    '-X',
    'POST',
    `${base}/v1/pacts/default/messages`,
    '-H',
    'content-type: application/json',
    '-d',
    JSON.stringify({ to: '*', content: 'Starting refactor of src/router/*' }),
  )
  await waitFor(
    async () =>
      JSON.parse(
        await curl('-sf', `${base}/v1/pacts/default/messages?since=${encodeURIComponent(cutoff)}`),
      ).entries,
    (arr: any[]) => arr.length >= 1,
  )

  // The jq projection documented in CLAUDE.md must still match the
  // response shape we emit.
  const projected = JSON.parse(
    await curl('-sf', `${base}/v1/pacts/default/knowledge?topic=routing&limit=20`),
  ).entries.map((entry: any) => ({
    id: entry.id,
    ts: entry.timestamp,
    topic: entry.payload.topic,
    content: entry.payload.content,
  }))
  const parsed = projected[0]
  t.is(parsed.topic, 'routing')
  t.ok(typeof parsed.ts === 'string')
})

test('claiming a task someone else already owns returns the documented 409', async (t) => {
  const { base } = await bootDaemon(t)
  const { id } = JSON.parse(
    await curl(
      '-sf',
      '-X',
      'POST',
      `${base}/v1/pacts/default/tasks`,
      '-H',
      'content-type: application/json',
      '-d',
      JSON.stringify({ title: 'Once' }),
    ),
  )
  await waitFor(
    async () => JSON.parse(await curl('-sf', `${base}/v1/pacts/default/tasks?status=open`)).entries,
    (arr: any[]) => arr.some((tt) => tt.id === id),
  )
  await curl('-sf', '-X', 'PUT', `${base}/v1/pacts/default/tasks/${id}/claim`)

  // Second claim must surface the documented error envelope. -s + -w
  // gives us status code; -o pipes body to a temp file we then parse.
  const errFile = path.join(os.tmpdir(), `openpact-cc-${Date.now()}.json`)
  const code = await curl(
    '-s',
    '-o',
    errFile,
    '-w',
    '%{http_code}',
    '-X',
    'PUT',
    `${base}/v1/pacts/default/tasks/${id}/claim`,
  )
  t.is(code.trim(), '409')
  const body = JSON.parse(await fs.readFile(errFile, 'utf8'))
  t.is(body.error, 'TASK_NOT_OPEN')
  await fs.unlink(errFile).catch(() => {})
})
