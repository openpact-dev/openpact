import test from 'brittle'
import { tmpHome, runWithDir } from './helpers/run-cli'
import { readPidFile, isAlive } from '../../src/lib/pid'

let nextPort = 19666

/*
 * E2E coverage for the new token-based invite / join surface.
 *
 * The full two-daemon happy path lives in
 *   packages/daemon/test/integration/invite-redeem.test.ts
 * which drives a hyperdht testnet. Here we only exercise CLI-local
 * surface — argv parsing, client-side token validation, daemon-down
 * behaviour — because spawning detached daemons from CLI e2e is slow
 * and flaky for two-peer scenarios.
 */

test('join: rejects a non-base64url token before touching the daemon', async (t) => {
  const home = await tmpHome(t)
  const res = await runWithDir(home, ['join', 'not%%a%%token'])
  t.not(res.exitCode, 0)
  t.ok(res.stderr.includes('invalid invite token'))
})

test('join: rejects an expired token', async (t) => {
  const home = await tmpHome(t)
  const expired = Buffer.from(
    JSON.stringify({
      v: 1,
      pactId: 'a'.repeat(64),
      nonce: 'b'.repeat(48),
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    }),
    'utf8',
  ).toString('base64url')
  const res = await runWithDir(home, ['join', expired, '--no-interactive'])
  t.not(res.exitCode, 0)
  t.ok(res.stderr.toLowerCase().includes('expired'))
})

test('invite: errors cleanly when the daemon is not running', async (t) => {
  const home = await tmpHome(t)
  const port = String(nextPort++) // isolate from any stray daemon on :7666
  await runWithDir(home, ['init', '--no-interactive', '--no-start'])
  const res = await runWithDir(home, ['invite', '--port', port])
  t.not(res.exitCode, 0)
  t.ok(res.stderr.toLowerCase().includes('not running'))
})

test('join: auto-starts the daemon when none is running', async (t) => {
  const home = await tmpHome(t)
  const port = String(nextPort++)
  const dashboardPort = '0' // OS-chosen free port; avoids conflicts across parallel tests

  // Well-formed token pointing at a pact nobody on this host knows about.
  // The redeem step will time out since no peer answers, but that's fine —
  // we only care that the daemon spawns and accepts the pact-join call.
  const future = new Date(Date.now() + 60_000).toISOString()
  const token = Buffer.from(
    JSON.stringify({
      v: 1,
      pactId: 'a'.repeat(64),
      nonce: 'b'.repeat(48),
      expiresAt: future,
      pactName: 'Auto Start Test',
    }),
    'utf8',
  ).toString('base64url')

  const res = await runWithDir(home, [
    'join',
    token,
    '--no-interactive',
    '--display-name',
    'auto-start-tester',
    '--port',
    port,
    '--dashboard-port',
    dashboardPort,
    '--timeout',
    '2',
  ])

  // Redeem will fail (no peers), so exit code is non-zero. What we're
  // checking is that the daemon started anyway, not that the redeem
  // succeeded.
  const pid = await readPidFile(home)
  t.ok(pid && pid > 0, 'daemon PID file exists after auto-start')
  t.ok(isAlive(pid!), 'auto-started daemon is alive')
  t.teardown(() => {
    if (pid && isAlive(pid)) {
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        /* gone */
      }
    }
  })
  t.ok(
    res.stderr.toLowerCase().includes('summoning') ||
      res.stderr.toLowerCase().includes('daemon not running'),
    'surfaces that auto-start happened',
  )
  // The redeem attempt hits the "no indexer peer" path after the short timeout.
  t.ok(
    res.stderr.toLowerCase().includes('indexer') || res.stderr.toLowerCase().includes('peer'),
    'proceeds past auto-start into the join flow',
  )
})
