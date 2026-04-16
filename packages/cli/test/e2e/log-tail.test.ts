import test from 'brittle'
import { tmpHome, runWithDir, authHeaders } from './helpers/run-cli'
import { readPidFile, isAlive } from '../../src/lib/pid'

let nextPort = 17500

async function ensureKilled(pid: number | null) {
  if (pid && isAlive(pid)) {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      /* gone */
    }
  }
}

test('log prints entries posted via REST', async (t) => {
  const home = await tmpHome(t)
  const port = nextPort++
  await runWithDir(home, ['init', '--alias', 'default'])

  await runWithDir(home, ['start', '--no-dashboard', '--port', String(port)])
  const pid = await readPidFile(home)
  t.teardown(() => ensureKilled(pid))
  t.teardown(() => runWithDir(home, ['stop']).catch(() => {}))

  // Wait until the daemon is reachable.
  const base = `http://127.0.0.1:${port}`
  await waitForPing(base)

  const headers = await authHeaders(home, { 'content-type': 'application/json' })
  await fetch(`${base}/v1/pacts/default/knowledge`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ topic: 'sales', content: 'cli log smoke' }),
  })
  await fetch(`${base}/v1/pacts/default/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ to: '*', content: 'hi everyone' }),
  })

  // Allow apply to land.
  await new Promise((r) => setTimeout(r, 300))

  const all = await runWithDir(home, ['log', '--port', String(port)])
  t.is(all.exitCode, 0)
  t.ok(all.stdout.includes('cli log smoke'), 'log shows knowledge entry')
  t.ok(all.stdout.includes('hi everyone'), 'log shows message entry')

  const filtered = await runWithDir(home, ['log', '--type', 'knowledge', '--port', String(port)])
  t.is(filtered.exitCode, 0)
  t.ok(filtered.stdout.includes('cli log smoke'))
  t.absent(filtered.stdout.includes('hi everyone'), '--type filter excludes other types')
})

test('log: errors when daemon not running', async (t) => {
  const home = await tmpHome(t)
  const port = nextPort++
  await runWithDir(home, ['init', '--alias', 'default'])
  const res = await runWithDir(home, ['log', '--port', String(port)])
  t.not(res.exitCode, 0)
  t.ok(res.stderr.includes('not running'))
})

test('log: rejects unknown --type', async (t) => {
  const home = await tmpHome(t)
  const res = await runWithDir(home, ['log', '--type', 'bogus'])
  t.not(res.exitCode, 0)
  t.ok(res.stderr.includes('unknown type'))
})

test('status: errors when daemon not running', async (t) => {
  const home = await tmpHome(t)
  const port = nextPort++
  await runWithDir(home, ['init', '--alias', 'default'])
  const res = await runWithDir(home, ['status', '--port', String(port)])
  t.not(res.exitCode, 0)
  t.ok(res.stderr.includes('not running'))
})

test('peers: errors when daemon not running', async (t) => {
  const port = nextPort++
  const res = await runWithDir(await tmpHome(t), ['peers', '--port', String(port)])
  t.not(res.exitCode, 0)
})

async function waitForPing(base: string, timeout = 10_000): Promise<void> {
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
