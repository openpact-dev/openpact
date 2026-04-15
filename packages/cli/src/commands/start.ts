import { spawn } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import { config as daemonConfig } from '@openpact/daemon'
import { resolveDataDir, type GlobalCliOpts } from '../lib/data-dir'
import { pidFileLooksAlive, writePidFile, pidPath, isAlive } from '../lib/pid'
import { startForegroundCmd } from './start-foreground'
import { c } from '../lib/theme'
import { spinner } from '../lib/spinner'

export interface StartOpts {
  foreground?: boolean
  port?: string | number
  bootstrap?: string
  /** Commander gives `dashboard: false` when --no-dashboard is set; default true. */
  dashboard?: boolean
  dashboardPort?: string | number
}

export async function startCmd(
  opts: StartOpts,
  cmd: { optsWithGlobals(): GlobalCliOpts },
): Promise<void> {
  const dir = resolveDataDir(cmd.optsWithGlobals())

  if (await pidFileLooksAlive(dir)) {
    throw new Error(
      `a daemon already appears to be bound (PID file at ${pidPath(dir)}). Run \`openpact stop\` first.`,
    )
  }

  if (opts.foreground) {
    await startForegroundCmd(opts, cmd)
    return
  }

  // Detached path: spawn ourselves as start-foreground.
  await fs.mkdir(dir, { recursive: true })
  const logPath = path.join(dir, 'daemon.log')
  const logFd = await fs.open(logPath, 'a')

  const childArgs = [
    process.argv[1], // bin/openpact.js
    '--data-dir',
    dir,
    'start-foreground',
    ...(opts.port ? ['--port', String(opts.port)] : []),
    ...(opts.bootstrap ? ['--bootstrap', opts.bootstrap] : []),
    ...(opts.dashboard === false ? ['--no-dashboard'] : []),
    ...(opts.dashboardPort !== undefined ? ['--dashboard-port', String(opts.dashboardPort)] : []),
  ]

  const child = spawn(process.execPath, childArgs, {
    detached: true,
    stdio: ['ignore', logFd.fd, logFd.fd],
    env: { ...process.env, OPENPACT_DATA_DIR: dir },
  })
  child.unref()
  await logFd.close()

  if (!child.pid) {
    throw new Error('failed to spawn detached daemon')
  }

  // Write our best-guess pid immediately so subsequent commands see it
  // even if the child hasn't run startForegroundCmd yet.
  await writePidFile(dir, child.pid)

  // Wait for the API to actually answer ping — confirms the daemon bound
  // its port. If it dies before binding, surface that immediately rather
  // than leaving the user with a stale "started" message.
  const port = Number(opts.port ?? 7666)
  const sp = spinner(`summoning the daemon on :${port}…`).start()
  const ready = await waitForReady(child.pid, port)
  if (!ready) {
    sp.fail(c.brand(`the daemon failed to bind. see logs at ${logPath}`))
    process.exit(1)
  }

  // Match-verify: a prior daemon from a *different* dataDir may already
  // own :port. Our detached child would have failed with EADDRINUSE and
  // died, but waitForReady happily pinged the stranger. Compare the
  // responding daemon's current pact_id with the registry we just wrote;
  // if they differ, the strange daemon is not ours.
  const registry = await daemonConfig.loadDaemonConfig(dir).catch(() => null)
  const expectedPactId =
    registry?.pacts.find((p) => p.alias === registry.currentAlias)?.pactId ?? null
  if (expectedPactId) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/v1/status`)
      const status = (await res.json()) as { pact_id?: string | null }
      if (status.pact_id && status.pact_id !== expectedPactId) {
        sp.fail(
          c.brand(
            `port :${port} is already held by a different pact (${status.pact_id.slice(
              0,
              12,
            )}…). run \`openpact stop\` in that dataDir first, or pass \`--port <n>\` to use a different port.`,
          ),
        )
        process.exit(1)
      }
    } catch {
      // Non-fatal — if the status probe fails, keep the happy path.
    }
  }
  sp.succeed(c.brandBold('The daemon stirs.'))

  console.log(`  ${c.brandBold('Listening')}  ${c.bone(`http://127.0.0.1:${port}`)}`)
  if (opts.dashboard !== false) {
    const dashPort = Number(opts.dashboardPort ?? 7667)
    console.log(`  ${c.brandBold('Dashboard')}  ${c.bone(`http://localhost:${dashPort}`)}`)
  }
  console.log(`  ${c.brandBold('PID')}        ${child.pid}`)
  console.log(`  ${c.brandBold('Data dir')}   ${c.ash(dir)}`)
  console.log(`  ${c.brandBold('Logs')}       ${c.ash(logPath)}`)
  console.log()
  console.log(c.ash('  next:  openpact status'))
}

async function waitForReady(pid: number, port: number, timeoutMs = 10_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return false
    try {
      const res = await fetch(`http://127.0.0.1:${port}/v1/ping`)
      if (res.ok) return true
    } catch {
      /* keep polling */
    }
    await new Promise((r) => setTimeout(r, 150))
  }
  return false
}
