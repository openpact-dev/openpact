import test from 'brittle'
import { tmpHome, runWithDir } from './helpers/run-cli'
import { readPidFile, isAlive } from '../../src/lib/pid'

let nextPort = 17800

/**
 * Regression: a daemon from a *different* dataDir holding :PORT used to
 * masquerade as ours. match-verify checked `/v1/status.pact_id` which
 * was absent on host-level responses, so a stranger with zero pacts
 * (or any set of unrelated pacts) silently passed the probe. The CLI
 * would announce "The daemon stirs" even though our detached child
 * died with EADDRINUSE on arrival. The user would then see an empty
 * dashboard while `openpact list` showed their real pacts.
 *
 * Now `openpact start` queries `/v1/pacts` and aborts unless the
 * responding daemon holds at least one of *our* pact IDs.
 */
test('start aborts when :port is held by a stranger daemon', async (t) => {
  const homeA = await tmpHome(t)
  const homeB = await tmpHome(t)
  const port = String(nextPort++)

  await runWithDir(homeA, ['init', '--alias', 'default'])
  await runWithDir(homeB, ['init', '--alias', 'default'])

  const first = await runWithDir(homeA, ['start', '--no-dashboard', '--port', port])
  t.is(first.exitCode, 0, 'daemon A starts cleanly')

  const pidA = await readPidFile(homeA)
  t.teardown(async () => {
    if (pidA && isAlive(pidA)) {
      try {
        process.kill(pidA, 'SIGKILL')
      } catch {
        /* gone */
      }
    }
    await runWithDir(homeA, ['stop']).catch(() => {})
  })

  await new Promise((r) => setTimeout(r, 500))

  // Now try to start daemon B on the *same* port. The detached child
  // will hit EADDRINUSE; match-verify should catch the mismatch.
  const second = await runWithDir(homeB, ['start', '--no-dashboard', '--port', port], {
    env: { ...process.env, NO_SPINNER: '1' },
  })
  t.not(second.exitCode, 0, 'second start exits non-zero')
  const output = second.stdout + '\n' + second.stderr
  t.ok(
    output.includes('different daemon') || output.includes('different pact'),
    `output mentions stranger; got stdout=${second.stdout} stderr=${second.stderr}`,
  )

  // Bailout should have killed the detached child and cleaned the pid file.
  // Allow a brief moment for SIGTERM to take effect.
  await new Promise((r) => setTimeout(r, 500))
  const pidB = await readPidFile(homeB)
  if (pidB !== null) t.absent(isAlive(pidB), 'no stale child left running for home B')
})
