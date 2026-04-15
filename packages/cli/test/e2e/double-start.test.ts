import test from 'brittle'
import { tmpHome, runWithDir } from './helpers/run-cli'
import { readPidFile, isAlive } from '../../src/lib/pid'

let nextPort = 17400

test('double start refuses with clear error', async (t) => {
  const home = await tmpHome(t)
  const port = String(nextPort++)
  await runWithDir(home, ['init'])

  const first = await runWithDir(home, ['start', '--no-dashboard', '--port', port])
  t.is(first.exitCode, 0)

  const pid = await readPidFile(home)
  t.teardown(async () => {
    if (pid && isAlive(pid)) {
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        /* gone */
      }
    }
    await runWithDir(home, ['stop']).catch(() => {})
  })

  await new Promise((r) => setTimeout(r, 500))

  const second = await runWithDir(home, ['start', '--no-dashboard', '--port', String(nextPort++)])
  t.not(second.exitCode, 0)
  t.ok(second.stderr.includes('already') || second.stderr.includes('already appears'))
})
