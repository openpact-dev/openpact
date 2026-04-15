import { Daemon, createApi, bind } from '@openpact/daemon'
import { resolveDataDir, type GlobalCliOpts } from '../lib/data-dir'
import { writePidFile, removePidFile } from '../lib/pid'
import { resolveBootstrap } from '../lib/bootstrap'
import { c, emoji, banner } from '../lib/theme'

export interface StartForegroundOpts {
  port?: string | number
  bootstrap?: string
}

/**
 * Boot the daemon + REST API and block until SIGINT/SIGTERM.
 *
 * Used by both `openpact start` (foreground) and the detached child of
 * `openpact start --daemon`. Writes its own PID and removes it on clean
 * shutdown.
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

  await writePidFile(dir, process.pid)

  process.stdout.write(banner())
  console.log(`  ${emoji.flame} ${c.brandBold('The daemon stirs.')}  listening on ${c.bone(url)}`)
  console.log(`  ${c.ash(`pact ${daemon.pactKey?.slice(0, 12)}…   you ${daemon.peerHandle}`)}`)
  console.log()

  let shuttingDown = false
  const shutdown = async (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    console.error(c.ash(`\nreceived ${signal}, banishing…`))
    try {
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
