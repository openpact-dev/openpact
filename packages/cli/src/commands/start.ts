import { spawn } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import { config as daemonConfig } from '@openpact/daemon'
import { resolveDataDir, type GlobalCliOpts } from '../lib/data-dir'
import { pidFileLooksAlive, writePidFile, removePidFile, pidPath, isAlive } from '../lib/pid'
import { startForegroundCmd } from './start-foreground'
import { c, banner } from '../lib/theme'
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

  // Detached path hides the daemon's own banner (it prints to the log
  // file, not stdout), so print it here before anything else happens.
  // Foreground path prints its own banner from startForegroundCmd.
  if (!opts.foreground) {
    process.stdout.write(banner())
  }

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
  const bail = async (msg: string): Promise<never> => {
    sp.fail(c.brand(msg))
    if (child.pid && isAlive(child.pid)) {
      try {
        process.kill(child.pid, 'SIGTERM')
      } catch {
        /* already gone */
      }
    }
    await removePidFile(dir).catch(() => {})
    process.exit(1)
  }
  if (!ready) {
    await bail(`the daemon failed to bind. see logs at ${logPath}`)
  }

  // Match-verify: a prior daemon from a *different* dataDir may already
  // own :port. Our detached child would have failed with EADDRINUSE and
  // died, but waitForReady happily pinged the stranger. Query the
  // responding daemon's pact list and confirm at least one of our
  // registry's pact IDs is present; if none are, it's a stranger.
  const registry = await daemonConfig.loadDaemonConfig(dir).catch(() => null)
  const ourPactIds = new Set((registry?.pacts ?? []).map((p) => p.pactId))
  if (ourPactIds.size > 0) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/v1/pacts`)
      const body = (await res.json()) as { pacts?: Array<{ pact_id?: string }> }
      const theirs = (body.pacts ?? []).map((p) => p.pact_id).filter(Boolean) as string[]
      const overlap = theirs.some((id) => ourPactIds.has(id))
      if (!overlap) {
        const summary =
          theirs.length === 0
            ? 'no pacts'
            : `${theirs.length} pact(s), none matching this host`
        await bail(
          `port :${port} is already held by a different daemon (${summary}). run \`openpact stop\` in that dataDir first, or pass \`--port <n>\` to use a different port.`,
        )
      }
    } catch {
      // Non-fatal — if the probe fails, keep the happy path.
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
