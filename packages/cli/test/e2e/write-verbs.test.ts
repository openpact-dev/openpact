import test from 'brittle'
import net from 'net'
import { stripVTControlCharacters } from 'util'
import { tmpHome, runWithDir, authHeaders } from './helpers/run-cli'
import { readPidFile, isAlive } from '../../src/lib/pid'

/** Parse the task id out of `op task add` stdout (stripped of ANSI colors). */
function extractTaskId(stdout: string): string {
  const match = stripVTControlCharacters(stdout).match(/Task\s+(\S+)/)
  if (!match) throw new Error(`no task id found in stdout: ${stdout}`)
  return match[1]
}

async function ensureKilled(pid: number | null): Promise<void> {
  if (pid && isAlive(pid)) {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      /* gone */
    }
  }
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, () => {
      const addr = srv.address()
      if (!addr || typeof addr === 'string') return reject(new Error('bad address'))
      srv.close(() => resolve(addr.port))
    })
  })
}

async function waitForPing(base: string, timeout = 15_000): Promise<void> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/v1/ping`)
      if (res.ok) return
    } catch {
      /* keep polling */
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`daemon at ${base} did not become reachable within ${timeout}ms`)
}

interface Env {
  home: string
  port: number
  base: string
}

async function bootPact(t: any): Promise<Env> {
  const home = await tmpHome(t)
  const port = await getFreePort()
  await runWithDir(home, ['init', '--alias', 'default', '--no-interactive'], { reject: true })
  await runWithDir(home, ['start', '--no-dashboard', '--port', String(port)], { reject: true })
  const pid = await readPidFile(home)
  t.teardown(() => ensureKilled(pid))
  t.teardown(() => runWithDir(home, ['stop']).catch(() => {}))
  const base = `http://127.0.0.1:${port}`
  await waitForPing(base)
  return { home, port, base }
}

test('message: broadcasts a short message and prints entry id', async (t) => {
  const { home, port, base } = await bootPact(t)
  const res = await runWithDir(
    home,
    ['message', 'starting refactor of src/router/*', '--port', String(port)],
    { reject: true },
  )
  t.is(res.exitCode, 0)
  t.ok(res.stdout.includes('Broadcast'))

  // Verify via REST that the message landed.
  await new Promise((r) => setTimeout(r, 300))
  const headers = await authHeaders(home)
  const msgs = await fetch(`${base}/v1/pacts/default/messages`, { headers }).then((r) => r.json())
  t.ok(msgs.entries.some((m: any) => m.payload.content === 'starting refactor of src/router/*'))
})

test('message: rejects empty content and unknown priority', async (t) => {
  const { home, port } = await bootPact(t)
  const empty = await runWithDir(home, ['message', '   ', '--port', String(port)])
  t.not(empty.exitCode, 0)
  t.ok(empty.stderr.includes('must not be empty'))

  const badPri = await runWithDir(home, [
    'message',
    'hi',
    '--priority',
    'urgent',
    '--port',
    String(port),
  ])
  t.not(badPri.exitCode, 0)
  t.ok(badPri.stderr.includes('unknown priority'))
})

test('record: persists knowledge with topic and prints id', async (t) => {
  const { home, port, base } = await bootPact(t)
  const res = await runWithDir(
    home,
    [
      'record',
      'Use the resolver factory in src/router.ts',
      '--topic',
      'routing',
      '--confidence',
      '0.9',
      '--port',
      String(port),
    ],
    { reject: true },
  )
  t.is(res.exitCode, 0)
  t.ok(res.stdout.includes('Recorded'))
  t.ok(res.stdout.includes('routing'))

  await new Promise((r) => setTimeout(r, 300))
  const headers = await authHeaders(home)
  const know = await fetch(`${base}/v1/pacts/default/knowledge?topic=routing`, { headers }).then(
    (r) => r.json(),
  )
  t.is(know.entries.length, 1)
  t.is(know.entries[0].payload.content, 'Use the resolver factory in src/router.ts')
  t.is(know.entries[0].payload.confidence, 0.9)
})

test('record: requires --topic and rejects bad confidence', async (t) => {
  const { home, port } = await bootPact(t)
  const missingTopic = await runWithDir(home, ['record', 'something', '--port', String(port)])
  t.not(missingTopic.exitCode, 0)
  // Commander's `requiredOption` emits a "required option" error.
  t.ok(/required option|--topic/.test(missingTopic.stderr))

  const badConf = await runWithDir(home, [
    'record',
    'x',
    '--topic',
    't',
    '--confidence',
    '2',
    '--port',
    String(port),
  ])
  t.not(badConf.exitCode, 0)
  t.ok(badConf.stderr.includes('--confidence'))
})

test('task: add → list → claim → complete lifecycle', async (t) => {
  const { home, port } = await bootPact(t)

  const add = await runWithDir(
    home,
    [
      'task',
      'add',
      'Migrate auth middleware',
      '--description',
      'long form',
      '--port',
      String(port),
    ],
    { reject: true },
  )
  t.is(add.exitCode, 0)
  t.ok(add.stdout.includes('Task'))
  const taskId = extractTaskId(add.stdout)
  t.ok(taskId, 'task id printed')

  // Wait for view to populate.
  await new Promise((r) => setTimeout(r, 400))

  const list = await runWithDir(
    home,
    ['task', 'list', '--status', 'open', '--port', String(port)],
    {
      reject: true,
    },
  )
  t.is(list.exitCode, 0)
  t.ok(list.stdout.includes('Migrate auth middleware'))
  t.ok(list.stdout.includes('open'))

  const claim = await runWithDir(home, ['task', 'claim', taskId, '--port', String(port)], {
    reject: true,
  })
  t.is(claim.exitCode, 0)
  t.ok(claim.stdout.includes('Claimed'))

  const complete = await runWithDir(
    home,
    ['task', 'complete', taskId, '--result', 'PR #123 merged', '--port', String(port)],
    { reject: true },
  )
  t.is(complete.exitCode, 0)
  t.ok(complete.stdout.includes('Completed'))
  t.ok(complete.stdout.includes('PR #123 merged'))
})

test('task: claiming an already-claimed task surfaces a typed error', async (t) => {
  const { home, port } = await bootPact(t)
  const add = await runWithDir(home, ['task', 'add', 'Once', '--port', String(port)], {
    reject: true,
  })
  const id = extractTaskId(add.stdout)
  await new Promise((r) => setTimeout(r, 300))
  await runWithDir(home, ['task', 'claim', id, '--port', String(port)], { reject: true })

  // Re-claim must refuse with a clear error.
  const second = await runWithDir(home, ['task', 'claim', id, '--port', String(port)])
  t.not(second.exitCode, 0)
  t.ok(second.stderr.includes('already claimed'))
})

test('task: list with no tasks renders empty-state message', async (t) => {
  const { home, port } = await bootPact(t)
  const res = await runWithDir(home, ['task', 'list', '--port', String(port)], { reject: true })
  t.is(res.exitCode, 0)
  t.ok(res.stdout.includes('No tasks yet'))
})

test('task list: rejects unknown status', async (t) => {
  const { home, port } = await bootPact(t)
  const res = await runWithDir(home, ['task', 'list', '--status', 'bogus', '--port', String(port)])
  t.not(res.exitCode, 0)
  t.ok(res.stderr.includes('unknown status'))
})

test('task: release returns a claimed task to open', async (t) => {
  const { home, port } = await bootPact(t)
  const add = await runWithDir(home, ['task', 'add', 'toRelease', '--port', String(port)], {
    reject: true,
  })
  const id = extractTaskId(add.stdout)
  await new Promise((r) => setTimeout(r, 300))
  await runWithDir(home, ['task', 'claim', id, '--port', String(port)], { reject: true })

  const release = await runWithDir(home, ['task', 'release', id, '--port', String(port)], {
    reject: true,
  })
  t.is(release.exitCode, 0)
  t.ok(release.stdout.includes('Released'))
  t.ok(release.stdout.includes('open'))
})

test('message: daemon not running → exit 1 with clear error', async (t) => {
  const home = await tmpHome(t)
  const port = await getFreePort()
  await runWithDir(home, ['init', '--alias', 'default', '--no-interactive'], { reject: true })
  const res = await runWithDir(home, ['message', 'hello', '--port', String(port)])
  t.not(res.exitCode, 0)
  t.ok(res.stderr.includes('not running'))
})
