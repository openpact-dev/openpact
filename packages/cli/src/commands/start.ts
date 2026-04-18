import { spawn } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import { config as daemonConfig } from '@openpact/daemon'
import { resolveDataDir, type GlobalCliOpts } from '../lib/data-dir'
import { pidFileLooksAlive, writePidFile, removePidFile, pidPath, isAlive } from '../lib/pid'
import { startForegroundCmd } from './start-foreground'
import { c, banner } from '../lib/theme'
import { card } from '../lib/format'
import { spinner } from '../lib/spinner'
import { checkForUpdate, formatUpdateWarning } from '../lib/version-check'
import { CLI_VERSION } from '../lib/cli-version'

export interface StartOpts {
  foreground?: boolean
  port?: string | number
  bootstrap?: string
  /** Commander gives `dashboard: false` when --no-dashboard is set; default true. */
  dashboard?: boolean
  dashboardPort?: string | number
  logLevel?: string
  logFile?: string
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

  // Non-blocking-ish registry check: cache-aware, short timeout, silent
  // on failure, skipped in CI and under OPENPACT_DISABLE_VERSION_CHECK.
  // Print the warning here (stderr) so it lands between the banner and
  // the "started" line without mixing into the daemon's JSON logs.
  try {
    const result = await checkForUpdate({ current: CLI_VERSION, cacheDir: dir })
    const warning = formatUpdateWarning(result)
    if (warning) process.stderr.write(`${warning}\n`)
  } catch {
    // Version check is strictly best-effort; never let it derail start.
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

  const entry = process.argv[1] ?? ''
  // Dev path: when the CLI is invoked through a TS entry (e.g.
  // `npx tsx packages/cli/src/main.ts`), plain `node entry.ts` can't
  // parse it. Prepend tsx's loader so the detached child uses the same
  // runtime as the parent. Published installs use bin/openpact.js and
  // take the no-op branch.
  const isTsEntry = /\.[mc]?tsx?$/i.test(entry)
  const childArgs = [
    ...(isTsEntry ? ['--import', 'tsx'] : []),
    entry,
    '--data-dir',
    dir,
    'start-foreground',
    ...(opts.port ? ['--port', String(opts.port)] : []),
    ...(opts.bootstrap ? ['--bootstrap', opts.bootstrap] : []),
    ...(opts.dashboard === false ? ['--no-dashboard'] : []),
    ...(opts.dashboardPort !== undefined ? ['--dashboard-port', String(opts.dashboardPort)] : []),
    ...(opts.logLevel ? ['--log-level', opts.logLevel] : []),
    ...(opts.logFile ? ['--log-file', opts.logFile] : []),
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
      // The GET /v1/pacts route is protected — send the token we know.
      // If a stranger daemon holds this port it won't have our token and
      // will 401; treat that as "not ours" and bail below.
      const token = await daemonConfig.readApiToken(dir)
      const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {}
      const res = await fetch(`http://127.0.0.1:${port}/v1/pacts`, { headers })
      if (res.status === 401) {
        await bail(
          `port :${port} is already held by a different daemon (unauthorized). run \`openpact stop\` in that dataDir first, or pass \`--port <n>\` to use a different port.`,
        )
      }
      const body = (await res.json()) as { pacts?: Array<{ pact_id?: string }> }
      const theirs = (body.pacts ?? []).map((p) => p.pact_id).filter(Boolean) as string[]
      const overlap = theirs.some((id) => ourPactIds.has(id))
      if (!overlap) {
        const summary =
          theirs.length === 0 ? 'no pacts' : `${theirs.length} pact(s), none matching this host`
        await bail(
          `port :${port} is already held by a different daemon (${summary}). run \`openpact stop\` in that dataDir first, or pass \`--port <n>\` to use a different port.`,
        )
      }
    } catch {
      // Non-fatal — if the probe fails, keep the happy path.
    }
  }
  sp.succeed(c.brandBold('The daemon stirs.'))
  console.log()

  const rows: Array<[string, string]> = [['Listening', c.bone(`http://127.0.0.1:${port}`)]]
  if (opts.dashboard !== false) {
    const dashPort = Number(opts.dashboardPort ?? 7667)
    rows.push(['Dashboard', c.bone(`http://localhost:${dashPort}`)])
  }
  rows.push(['PID', c.ash(String(child.pid))])
  rows.push(['Data dir', c.ash(dir)])
  rows.push(['Logs', c.ash(logPath)])

  console.log(
    card({
      title: 'Daemon running',
      sections: [{ rows }],
      next: [['openpact status', 'Inspect the current pact']],
    }),
  )
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
