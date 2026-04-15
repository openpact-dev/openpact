import test from 'brittle'
import fs from 'fs/promises'
import { tmpHome, runWithDir } from './helpers/run-cli'
import { readPidFile, isAlive, pidPath } from '../../src/lib/pid'

let nextPort = 17666

test('start writes PID; stop removes it', async (t) => {
  const home = await tmpHome(t)
  const port = String(nextPort++)

  await runWithDir(home, ['init'])

  const start = await runWithDir(home, ['start', '--port', port])
  t.is(start.exitCode, 0)
  t.ok(start.stdout.includes('PID'))
  t.ok(start.stdout.includes('daemon stirs') || start.stdout.includes('Listening'))

  const pid = await readPidFile(home)
  t.ok(pid && pid > 0, 'pid file exists')
  t.ok(isAlive(pid!), 'process is alive')
  t.teardown(() => {
    if (pid && isAlive(pid)) {
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        /* gone */
      }
    }
  })

  // Give the daemon a moment to bind the API.
  await new Promise((r) => setTimeout(r, 800))

  const stop = await runWithDir(home, ['stop'])
  t.is(stop.exitCode, 0)
  t.ok(stop.stdout.includes('banished'))

  // PID file removed.
  await new Promise((r) => setTimeout(r, 100))
  await t.exception(() => fs.access(pidPath(home)))
  t.absent(isAlive(pid!), 'process is gone')
})

test('stop without running daemon is a no-op', async (t) => {
  const home = await tmpHome(t)
  await runWithDir(home, ['init'])
  const res = await runWithDir(home, ['stop'])
  t.is(res.exitCode, 0)
  t.ok(res.stderr.includes('no PID file') || res.stderr.includes('no daemon to banish'))
})
