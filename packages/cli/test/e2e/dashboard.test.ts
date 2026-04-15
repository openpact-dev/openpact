/**
 * `openpact start` brings up the dashboard on :7667 by default.
 * `--no-dashboard` skips it (for headless / CI / seed nodes).
 * `--dashboard-port 0` lets the OS pick a free port — used by tests so
 * parallel runs don't fight over a fixed port.
 */
import test from 'brittle'
import { tmpHome, runWithDir } from './helpers/run-cli'
import { readPidFile, isAlive } from '../../src/lib/pid'

let nextDaemonPort = 18900
let nextDashPort = 28900

async function killPid(pid: number | null): Promise<void> {
  if (pid && isAlive(pid)) {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      /* gone */
    }
  }
}

test('start with --dashboard-port binds the dashboard and proxies to the daemon', async (t) => {
  const home = await tmpHome(t)
  const port = String(nextDaemonPort++)
  const dashPort = String(nextDashPort++)
  await runWithDir(home, ['init', '--alias', 'default'])

  const start = await runWithDir(home, ['start', '--port', port, '--dashboard-port', dashPort])
  t.is(start.exitCode, 0)

  const pid = await readPidFile(home)
  t.teardown(() => killPid(pid))

  // Wait for both ports to bind.
  await new Promise((r) => setTimeout(r, 800))

  // Daemon API is up.
  const ping = await fetch(`http://127.0.0.1:${port}/v1/ping`)
  t.is(ping.status, 200)

  // Dashboard proxies /api/v1/ping → daemon /v1/ping (proxy strips /api).
  const proxied = await fetch(`http://127.0.0.1:${dashPort}/api/v1/ping`)
  t.is(proxied.status, 200)
  t.alike(await proxied.json(), { ok: true })

  await runWithDir(home, ['stop'])
})

test('start with --no-dashboard skips the dashboard banner line', async (t) => {
  const home = await tmpHome(t)
  const port = String(nextDaemonPort++)
  await runWithDir(home, ['init', '--alias', 'default'])

  const start = await runWithDir(home, ['start', '--no-dashboard', '--port', port])
  t.is(start.exitCode, 0)
  t.absent(start.stdout.includes('Dashboard'), 'no dashboard line in banner')

  const pid = await readPidFile(home)
  t.teardown(() => killPid(pid))

  await runWithDir(home, ['stop'])
})
