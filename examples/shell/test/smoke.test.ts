/**
 * Boots a tmp daemon on an ephemeral port and runs each documented
 * shell script against it, asserting the daemon's view changed as
 * expected.
 */
import test from 'brittle'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { Daemon, createApi, bind } from '@openpact/daemon'

const run = promisify(execFile)
const SCRIPTS = path.resolve(__dirname, '..', 'scripts')

let nextPort = 21000

interface Env {
  base: string
  daemon: Daemon
}

async function bootDaemon(t: any): Promise<Env> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openpact-shell-'))
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
  return { base: `http://127.0.0.1:${port}`, daemon }
}

async function sh(base: string, script: string, ...args: string[]): Promise<string> {
  const { stdout } = await run('bash', [path.join(SCRIPTS, script), ...args], {
    env: { ...process.env, OPENPACT_URL: base },
  })
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

test('record.sh + recall.sh round-trip', async (t) => {
  const { base } = await bootDaemon(t)
  const created = JSON.parse(
    await sh(base, 'record.sh', 'routing', 'use the resolver factory', '0.9'),
  )
  t.ok(/^[0-9a-f]{4}-\d+$/.test(created.id))

  const list = await waitFor(
    async () => sh(base, 'recall.sh', 'routing'),
    (out: string) => out.includes('"topic": "routing"'),
  )
  t.ok(list.includes('"content": "use the resolver factory"'))
})

test('tasks.sh: create → list → claim → complete', async (t) => {
  const { base } = await bootDaemon(t)
  const created = JSON.parse(await sh(base, 'tasks.sh', 'create', 'do the thing', 'now'))
  const id = created.id

  await waitFor(
    async () => JSON.parse(await sh(base, 'tasks.sh', 'list', 'open')),
    (arr: any[]) => arr.some((tt) => tt.id === id),
  )

  const claimed = JSON.parse(await sh(base, 'tasks.sh', 'claim', id))
  t.is(claimed.task.status, 'claimed')

  const completed = JSON.parse(await sh(base, 'tasks.sh', 'complete', id, 'shipped'))
  t.is(completed.task.status, 'complete')
  t.is(completed.task.result, 'shipped')
})

test('send.sh broadcasts a message', async (t) => {
  const { base } = await bootDaemon(t)
  const sent = JSON.parse(await sh(base, 'send.sh', '*', 'hello from shell'))
  t.ok(/^[0-9a-f]{4}-\d+$/.test(sent.id))

  await waitFor(
    async () => {
      const res = await fetch(`${base}/v1/pacts/default/messages`)
      return ((await res.json()) as { entries: any[] }).entries
    },
    (arr) => arr.some((m) => m.payload.content === 'hello from shell'),
  )
})
