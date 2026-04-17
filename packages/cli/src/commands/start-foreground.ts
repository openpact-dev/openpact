import {
  Daemon,
  createApi,
  bind,
  config as daemonConfig,
  createLogger,
  defaultLogFile,
  isLogLevel,
  type LogLevel,
} from '@openpact/daemon'
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
  /** Pino log level (info, debug, warn, etc). Defaults to 'info'. */
  logLevel?: string
  /**
   * Where to send the JSON log stream. Defaults to
   * `<dataDir>/logs/daemon.log`. Pass `-` to skip the file sink and
   * only log to stdout.
   */
  logFile?: string
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

  const requestedLevel = opts.logLevel
  if (requestedLevel && !isLogLevel(requestedLevel)) {
    throw new Error(
      `--log-level must be one of fatal|error|warn|info|debug|trace|silent (got ${requestedLevel})`,
    )
  }
  const level: LogLevel = (requestedLevel as LogLevel | undefined) ?? 'info'
  const { logger, close: closeLogger } = await createLogger({
    level,
    file: opts.logFile,
    dataDir: dir,
  })

  const swarm = bootstrap ? { bootstrap } : undefined
  const daemon = await Daemon.load({ dataDir: dir, swarm })
  await daemon.start()

  // Mint (or load) the bearer token the REST API requires. Written to
  // ~/.openpact/daemon.json with mode 0600 so only this user can read it.
  const { apiToken } = await daemonConfig.ensureApiToken(dir)

  const app = createApi(daemon, { token: apiToken, logger })
  const url = await bind(app, { port })

  let dashboard: StartDashboardResult | null = null
  // Commander gives us `dashboard: false` when --no-dashboard is set,
  // `dashboard: true` (default) otherwise. Treat undefined as true.
  if (opts.dashboard !== false) {
    const dashboardPort = Number(opts.dashboardPort ?? 7667)
    try {
      dashboard = await startDashboard({
        daemonPort: port,
        port: dashboardPort,
        daemonToken: apiToken,
      })
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
  if (daemon.pactKey) {
    console.log(`  ${c.ash(`pact ${daemon.pactKey.slice(0, 12)}…   agent ${daemon.peerHandle}`)}`)
  } else {
    console.log(
      `  ${c.ash('No pacts yet. Run `openpact init` or `openpact join <token>` to add one.')}`,
    )
  }
  if (opts.logFile !== '-') {
    console.log(`  ${c.ash(`logs   ${opts.logFile ?? defaultLogFile(dir)}  (level=${level})`)}`)
  }
  console.log()
  logger.info(
    { url, dashboard: dashboard?.url ?? null, pactKey: daemon.pactKey ?? null },
    'daemon up',
  )

  let shuttingDown = false
  const shutdown = async (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    console.error(c.ash(`\nreceived ${signal}, banishing…`))
    logger.info({ signal }, 'shutdown')
    try {
      if (dashboard) await dashboard.close()
      await app.close()
      await daemon.stop()
      await removePidFile(dir)
      await closeLogger()
    } catch (err) {
      logger.error({ err }, 'error during shutdown')
      console.error(c.brand(`✗ error during shutdown: ${(err as Error).message}`))
    }
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))

  // Phase 3a: keep the daemon up when something downstream throws an
  // unhandled exception or rejects a promise without a catch. The
  // alternative — Node's default — is to print the stack and exit,
  // which is the worst possible failure mode for a service that holds
  // long-running swarm state. Log loudly and stay alive; the swarm
  // and Autobase recover on the next tick.
  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'unhandledRejection')
  })
  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'uncaughtException')
  })

  // Surface peer + swarm errors that the daemon has already swallowed
  // (see Daemon._swarm.on('error') / conn.on('error')) so an operator
  // tailing `op start --foreground` sees them.
  daemon.on('peer-error', ({ remoteKey, error }: { remoteKey: string | null; error: Error }) => {
    logger.warn({ remoteKey: remoteKey?.slice(0, 16) ?? null, err: error }, 'peer error')
  })
  daemon.on('swarm-error', ({ error }: { error: Error }) => {
    logger.warn({ err: error }, 'swarm error')
  })

  // Full peer + auth + liveness lifecycle. Without these in the log
  // file, sleep/wake bugs and flaky reconnect bugs are undiagnosable
  // — the dashboard's SSE feed is gone the moment the user closes the
  // tab. Volume is bounded: a normal session emits one peer-add and
  // one member-online per remote peer per pact per connection.
  daemon.on('peer-add', ({ remoteKey }: { remoteKey: string }) => {
    logger.info({ remoteKey: remoteKey.slice(0, 16) }, 'peer add')
  })
  daemon.on('peer-remove', ({ remoteKey }: { remoteKey: string }) => {
    logger.info({ remoteKey: remoteKey.slice(0, 16) }, 'peer remove')
  })
  daemon.on(
    'member-online',
    ({
      pactId,
      alias,
      member_key,
    }: {
      pactId: string | null
      alias?: string
      member_key: string
    }) => {
      logger.info(
        { pactId: pactId?.slice(0, 16) ?? null, alias, memberKey: member_key.slice(0, 16) },
        'member online',
      )
    },
  )
  daemon.on(
    'member-offline',
    ({
      pactId,
      alias,
      member_key,
    }: {
      pactId: string | null
      alias?: string
      member_key: string
    }) => {
      logger.info(
        { pactId: pactId?.slice(0, 16) ?? null, alias, memberKey: member_key.slice(0, 16) },
        'member offline',
      )
    },
  )
  daemon.on(
    'auth-attempt',
    ({
      remoteKey,
      pactId,
      attempt,
    }: {
      remoteKey: string | null
      pactId: string
      attempt: number
    }) => {
      logger.debug({ remoteKey, pactId: pactId.slice(0, 16), attempt }, 'auth attempt')
    },
  )
  daemon.on(
    'auth-timeout',
    ({
      remoteKey,
      pactId,
      attempt,
    }: {
      remoteKey: string | null
      pactId: string
      attempt: number
    }) => {
      logger.warn({ remoteKey, pactId: pactId.slice(0, 16), attempt }, 'auth timeout')
    },
  )
  daemon.on(
    'auth-fail',
    ({
      remoteKey,
      pactId,
      reason,
    }: {
      remoteKey: string | null
      pactId: string
      reason: string
    }) => {
      logger.warn({ remoteKey, pactId: pactId.slice(0, 16), reason }, 'auth fail')
    },
  )
  daemon.on(
    'liveness-miss',
    ({ remoteKey, missed }: { remoteKey: string | null; missed: number }) => {
      logger.warn({ remoteKey, missed }, 'liveness miss')
    },
  )
  daemon.on('liveness-recover', ({ remoteKey }: { remoteKey: string | null }) => {
    logger.info({ remoteKey }, 'liveness recover')
  })
  daemon.on(
    'liveness-dead',
    ({ remoteKey, missed }: { remoteKey: string | null; missed: number }) => {
      logger.warn({ remoteKey, missed }, 'liveness dead — destroying conn for reconnect')
    },
  )

  // Admin entries are rare and consequential (addWriter, removeWriter,
  // setInfo). Logging every applied admin entry keeps rename /
  // member-admission debugging cheap — next time "nothing synced" comes
  // up, the log shows whether the entry actually reached this peer.
  // Regular entry-applied events (knowledge / task / skill / message)
  // stay off the log to keep volume sane.
  daemon.on(
    'entry-applied',
    (info: { kind?: string; entry?: unknown; pactId?: string | null; alias?: string | null }) => {
      if (info.kind !== 'admin') return
      const e = info.entry as {
        payload?: {
          action?: string
          key?: string
          name?: unknown
          purpose?: unknown
          indexer?: boolean
        }
        agent_id?: string
      }
      logger.info(
        {
          alias: info.alias,
          pactId: info.pactId?.slice(0, 16) ?? null,
          action: e?.payload?.action,
          writer: e?.agent_id,
          name: typeof e?.payload?.name === 'string' ? e.payload.name : e?.payload?.name,
          purpose:
            typeof e?.payload?.purpose === 'string' ? e.payload.purpose : e?.payload?.purpose,
          key: e?.payload?.key?.slice(0, 16),
          indexer: e?.payload?.indexer,
        },
        'admin entry applied',
      )
    },
  )

  // Block forever — Node stays alive while the swarm + http server hold handles.
  await new Promise(() => {})
}
