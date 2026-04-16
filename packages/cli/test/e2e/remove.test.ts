import test from 'brittle'
import fs from 'fs/promises'
import path from 'path'
import { tmpHome, runWithDir } from './helpers/run-cli'
import { readPidFile, isAlive, pidPath, writePidFile } from '../../src/lib/pid'

let nextPort = 37666

// `remove` when no daemon is running: direct in-process path.
test('remove without running daemon wipes the pact dir', async (t) => {
  const home = await tmpHome(t)
  await runWithDir(home, ['init', '--alias', 'default'])

  const pactDir = path.join(home, 'pacts', 'default')
  const stat = await fs.stat(pactDir)
  t.ok(stat.isDirectory(), 'pact dir exists before remove')

  const res = await runWithDir(home, ['remove', 'default', '--yes'])
  t.is(res.exitCode, 0)
  t.ok(res.stdout.includes('Removed'))

  await t.exception(() => fs.access(pactDir), 'pact dir is gone')
})

// `remove` when a daemon is live: must route through REST so the
// running daemon's corestore locks are respected. If we opened a second
// Daemon in-process instead we'd corrupt the log.
test('remove with live daemon routes through REST', async (t) => {
  const home = await tmpHome(t)
  const port = String(nextPort++)

  await runWithDir(home, ['init', '--alias', 'default'])

  const start = await runWithDir(home, ['start', '--no-dashboard', '--port', port])
  t.is(start.exitCode, 0)

  const pid = await readPidFile(home)
  t.ok(pid && pid > 0, 'pid file exists')
  t.teardown(async () => {
    if (pid && isAlive(pid)) {
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        /* gone */
      }
    }
  })
  await new Promise((r) => setTimeout(r, 800))

  const pactDir = path.join(home, 'pacts', 'default')
  await fs.access(pactDir)

  const res = await runWithDir(home, ['remove', 'default', '--yes', '--port', port])
  t.is(res.exitCode, 0)
  t.ok(res.stdout.includes('Removed'))

  // Pid file still present — the daemon is still alive, just without
  // that pact. Stop it so teardown is clean.
  t.ok(await readPidFile(home), 'daemon pid file still there after REST remove')
  await t.exception(() => fs.access(pactDir), 'pact dir is gone')

  await runWithDir(home, ['stop'])
  await new Promise((r) => setTimeout(r, 200))
  await t.exception(() => fs.access(pidPath(home)))
})

// A stale pid file from a crashed daemon must not block `remove`. We
// clean it up and fall back to the direct path.
test('remove cleans up a stale pid file and removes the pact', async (t) => {
  const home = await tmpHome(t)
  await runWithDir(home, ['init', '--alias', 'default'])

  // 2^31-1 is the classic "definitely-not-running" sentinel pid on
  // POSIX. Some kernels allow values up to 2^22; either way this pid
  // is not going to belong to a live process during the test.
  await writePidFile(home, 2147483647)

  const pactDir = path.join(home, 'pacts', 'default')
  await fs.access(pactDir)

  const res = await runWithDir(home, ['remove', 'default', '--yes'])
  t.is(res.exitCode, 0)
  t.ok(res.stdout.includes('Removed'))

  await t.exception(() => fs.access(pactDir), 'pact dir is gone')
  await t.exception(() => fs.access(pidPath(home)), 'stale pid file was cleaned')
})
