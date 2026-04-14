import { Daemon, createApi, bind } from '@openpact/daemon'
import pc from 'picocolors'
import { resolveDataDir, type GlobalCliOpts } from '../lib/data-dir'
import { writePidFile, removePidFile } from '../lib/pid'

export interface StartForegroundOpts {
  port?: string | number
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
  const port = Number(opts.port ?? 7331)

  const daemon = await Daemon.load({ dataDir: dir })
  await daemon.start()

  const app = createApi(daemon)
  const url = await bind(app, { port })

  await writePidFile(dir, process.pid)

  console.log(pc.green(`openpact daemon listening on ${url}`))
  console.log(pc.dim(`  pact: ${daemon.pactKey}`))
  console.log(pc.dim(`  you:  ${daemon.peerHandle}`))

  let shuttingDown = false
  const shutdown = async (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    console.error(pc.dim(`\nreceived ${signal}, shutting down…`))
    try {
      await app.close()
      await daemon.stop()
      await removePidFile(dir)
    } catch (err) {
      console.error(pc.red(`error during shutdown: ${(err as Error).message}`))
    }
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))

  // Block forever — Node stays alive while the swarm + http server hold handles.
  await new Promise(() => {})
}
