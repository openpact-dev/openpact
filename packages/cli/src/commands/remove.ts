import { Daemon, config as daemonConfig } from '@openpact/daemon'
import { OpenPact, DaemonNotRunningError, UnauthorizedError } from '@openpact/sdk'
import { resolveDataDir, type GlobalCliOpts } from '../lib/data-dir'
import { c, emoji } from '../lib/theme'
import { askText } from '../lib/prompt'
import { readPidFile, isAlive, removePidFile } from '../lib/pid'

export interface RemoveOpts {
  /** Skip the "type the alias to confirm" prompt. */
  yes?: boolean
  /** Commander maps --no-interactive to interactive: false. */
  interactive?: boolean
  /** Override the daemon port when routing through REST. */
  port?: string | number
}

/**
 * `openpact remove <alias>` — leave a pact and delete its data.
 *
 * Destructive: the pact's corestore + installed skills + config go
 * away. To avoid accidental runs the user must either pass --yes or
 * type the alias back when prompted.
 *
 * There are two code paths:
 *
 * 1. A daemon is live for this hostDir → send DELETE /v1/pacts/:alias
 *    over REST. This is the only safe path when the daemon is running:
 *    attempting to open a second `Daemon` against the same corestore
 *    would race on sqlite / hyperbee and corrupt state. The daemon
 *    itself owns the removePact() call and keeps its registry consistent.
 *
 * 2. No daemon (or stale pid file) → construct an in-process Daemon,
 *    call removePact, and clean up any orphaned pid. This covers the
 *    "user ran stop --force-kill and left junk" case and normal CI
 *    teardown where a daemon was never started.
 */
export async function removeCmd(
  alias: string,
  opts: RemoveOpts,
  cmd: { optsWithGlobals(): GlobalCliOpts },
): Promise<void> {
  const hostDir = resolveDataDir(cmd.optsWithGlobals())
  const registry = await daemonConfig.loadDaemonConfig(hostDir).catch(() => null)
  if (!registry || registry.pacts.length === 0) {
    throw new Error(`no pacts at ${hostDir}.`)
  }
  const entry = registry.pacts.find((p) => p.alias === alias)
  if (!entry) {
    const known = registry.pacts.map((p) => p.alias).join(', ') || '(none)'
    throw new Error(`no pact named ${alias}. known: ${known}`)
  }

  const nonInteractive = opts.interactive === false || !!opts.yes
  if (!opts.yes) {
    const typed = await askText({
      nonInteractive,
      default: '',
      label: `Type "${alias}" to confirm removal`,
      max: 64,
    })
    if (typed !== alias) {
      // In non-interactive mode the default is '' which won't match —
      // the user must pass --yes to commit destructive actions from CI.
      throw new Error(
        nonInteractive
          ? `refusing to remove ${alias} without --yes (would wipe ${entry.dataDir})`
          : `confirmation mismatch — expected "${alias}", got "${typed}". aborted.`,
      )
    }
  }

  // Decide which path to take. A live pid file means a daemon currently
  // holds the corestore locks; a stale pid is evidence of a crash we
  // should clean up before touching disk ourselves.
  const pid = await readPidFile(hostDir)
  const alive = pid !== null && isAlive(pid)
  if (pid !== null && !alive) {
    await removePidFile(hostDir).catch(() => undefined)
  }

  if (alive) {
    const port = Number(opts.port ?? registry.port ?? 7666)
    const client = new OpenPact({ port, hostDir })
    try {
      await client.pacts.remove(alias)
    } catch (err) {
      if (err instanceof DaemonNotRunningError) {
        // Pid file claimed the daemon was alive but we can't talk to it.
        // Surface a clear message — don't silently fall back to an
        // in-process open that would race against the real daemon.
        throw new Error(
          `pid ${pid} looks alive but the daemon at :${port} is not responding. ` +
            `run \`openpact stop\` (or remove the stale pid at ${hostDir}) and try again.`,
        )
      }
      if (err instanceof UnauthorizedError) {
        throw new Error(
          `daemon at :${port} rejected our bearer token — this data dir is not serving ` +
            `the running daemon. check that the daemon was started with --data-dir ${hostDir}.`,
        )
      }
      throw err
    }
  } else {
    // No daemon is running — safe to open the corestore directly.
    const daemon = new Daemon({ dataDir: hostDir })
    try {
      await daemon.removePact(alias)
    } finally {
      await daemon.stop()
    }
  }

  console.log(`  ${emoji.brand} ${c.brandBold('Removed')} ${c.bone(alias)}`)
  console.log(`  ${c.ash(`Wiped ${entry.dataDir}`)}`)
}
