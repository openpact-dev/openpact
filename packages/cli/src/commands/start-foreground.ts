import { Daemon, createApi, bind } from '@openpact/daemon'
import { startDashboard, type StartDashboardResult } from '@openpact/dashboard'
import { resolveDataDir, type GlobalCliOpts } from '../lib/data-dir'
import { writePidFile, removePidFile } from '../lib/pid'
import { resolveBootstrap } from '../lib/bootstrap'
import { c, emoji, banner } from '../lib/theme'

export interface StartForegroundOpts {
  port?: string | number
  bootstrap?: string
  /**
   * Commander maps `--no-dashboard` to `opts.dashboard === false`
   * (and `opts.dashboard === true` by default). When false, skip
   * starting the dashboard server (headless / seed nodes / CI).
   */
  dashboard?: boolean
  /** Override the dashboard port (default 7667; pass 0 for an OS-chosen free port in tests). */
  dashboardPort?: string | number
}

/**
 * Boot the daemon + REST API and block until SIGINT/SIGTERM.
 *
 * Used by both `openpact start --foreground` and the detached child of
 * `openpact start`. Writes its own PID and removes it on clean shutdown.
 *
 * Also starts the dashboard server on :7667 unless --no-dashboard is set.
 * The dashboard is a thin Fastify instance that proxies /api/* to the
 * daemon's REST and serves the built SPA.
 */
export async function startForegroundCmd(
  opts: StartForegroundOpts,
  cmd: { optsWithGlobals(): GlobalCliOpts },
): Promise<void> {
  const dir = resolveDataDir(cmd.optsWithGlobals())
  const port = Number(opts.port ?? 7666)
  const bootstrap = resolveBootstrap(opts.bootstrap)

  const swarm = bootstrap ? { bootstrap } : undefined
  const daemon = await Daemon.load({ dataDir: dir, swarm })
  await daemon.start()

  const app = createApi(daemon)
  const url = await bind(app, { port })

  let dashboard: StartDashboardResult | null = null
  // Commander gives us `dashboard: false` when --no-dashboard is set,
  // `dashboard: true` (default) otherwise. Treat undefined as true.
  if (opts.dashboard !== false) {
    const dashboardPort = Number(opts.dashboardPort ?? 7667)
    try {
      dashboard = await startDashboard({ daemonPort: port, port: dashboardPort })
    } catch (err) {
      console.error(c.brand(`✗ dashboard failed to start: ${(err as Error).message}`))
      console.error(c.ash('  daemon will continue without the dashboard'))
    }
  }

  await writePidFile(dir, process.pid)

  process.stdout.write(banner())
  console.log(`  ${emoji.flame} ${c.brandBold('The daemon stirs.')}  listening on ${c.bone(url)}`)
  if (dashboard) {
    console.log(`  ${c.brandBold('Dashboard')}  ${c.bone(dashboard.url)}`)
  }
  console.log(`  ${c.ash(`pact ${daemon.pactKey?.slice(0, 12)}…   agent ${daemon.peerHandle}`)}`)
  console.log()

  let shuttingDown = false
  const shutdown = async (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    console.error(c.ash(`\nreceived ${signal}, banishing…`))
    try {
      if (dashboard) await dashboard.close()
      await app.close()
      await daemon.stop()
      await removePidFile(dir)
    } catch (err) {
      console.error(c.brand(`✗ error during shutdown: ${(err as Error).message}`))
    }
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))

  // Block forever — Node stays alive while the swarm + http server hold handles.
  await new Promise(() => {})
}
