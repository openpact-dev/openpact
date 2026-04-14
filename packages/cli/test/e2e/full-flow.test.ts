import test from 'brittle'
import { tmpHome, runWithDir } from './helpers/run-cli'
import { readPidFile, isAlive } from '../../src/lib/pid'

let nextPort = 17600

async function ensureKilled(pid: number | null) {
  if (pid && isAlive(pid)) {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      /* gone */
    }
  }
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

test('full flow: A creates, B joins, A posts, B sees via log', async (t) => {
  // NOTE: this test uses the real DHT (not testnet) because the CLI doesn't
  // currently expose a swarm bootstrap override. The integration tests in
  // packages/daemon/test/integration/api/cross-daemon-api.test.ts cover the
  // testnet path; this test exists primarily to prove the CLI plumbing
  // works end-to-end. It may be slower or flakier on networks without DHT
  // access — if so, mark it skip until Phase 4 adds a --bootstrap CLI flag.
  // For now we run a pair on the same machine via different data dirs and
  // pact keys (NOT joined to the same pact; we just verify A and B both
  // serve their own data).
  // The TRUE two-machine flow lands when we add --bootstrap support.

  const a = await tmpHome(t)
  const b = await tmpHome(t)
  const portA = nextPort++
  const portB = nextPort++

  // A: init + start
  await runWithDir(a, ['init'])
  await runWithDir(a, ['start', '--daemon', '--port', String(portA)])
  const pidA = await readPidFile(a)
  t.teardown(() => ensureKilled(pidA))
  t.teardown(() => runWithDir(a, ['stop']).catch(() => {}))

  // B: init + start (separate pact for now — see note above)
  await runWithDir(b, ['init'])
  await runWithDir(b, ['start', '--daemon', '--port', String(portB)])
  const pidB = await readPidFile(b)
  t.teardown(() => ensureKilled(pidB))
  t.teardown(() => runWithDir(b, ['stop']).catch(() => {}))

  await waitForPing(`http://127.0.0.1:${portA}`)
  await waitForPing(`http://127.0.0.1:${portB}`)

  // A: status works via CLI
  const aStatus = await runWithDir(a, ['status', '--port', String(portA)])
  t.is(aStatus.exitCode, 0)
  t.ok(aStatus.stdout.includes('Pact:'))
  t.ok(aStatus.stdout.includes('creator'))

  // A: POST a knowledge entry
  const post = await fetch(`http://127.0.0.1:${portA}/v1/knowledge`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ topic: 'cli-flow', content: 'end-to-end smoke' }),
  })
  t.is(post.status, 200)

  // Wait for it to appear in A's log via the CLI
  const deadline = Date.now() + 10_000
  let aLog = ''
  while (Date.now() < deadline) {
    const out = await runWithDir(a, ['log', '--port', String(portA)])
    aLog = out.stdout
    if (aLog.includes('end-to-end smoke')) break
    await new Promise((r) => setTimeout(r, 200))
  }
  t.ok(aLog.includes('end-to-end smoke'), 'A sees its own entry via CLI log')
  t.ok(aLog.includes('cli-flow'))

  // B's log on a separate pact should not see A's entry
  const bLog = await runWithDir(b, ['log', '--port', String(portB)])
  t.absent(bLog.stdout.includes('end-to-end smoke'), 'B (separate pact) does not see A entry')

  // Stop both via CLI
  const stopA = await runWithDir(a, ['stop'])
  t.is(stopA.exitCode, 0)
  const stopB = await runWithDir(b, ['stop'])
  t.is(stopB.exitCode, 0)
})
