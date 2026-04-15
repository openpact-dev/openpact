import { Daemon, config as daemonConfig } from '@openpact/daemon'
import { resolveDataDir, type GlobalCliOpts } from '../lib/data-dir'
import { c, emoji } from '../lib/theme'
import { askText } from '../lib/prompt'

export interface RemoveOpts {
  /** Skip the "type the alias to confirm" prompt. */
  yes?: boolean
  /** Commander maps --no-interactive to interactive: false. */
  interactive?: boolean
}

/**
 * `openpact remove <alias>` — leave a pact and delete its data.
 * Destructive: the pact's corestore + installed skills + config go
 * away. To avoid accidental runs the user must either pass --yes or
 * type the alias back when prompted.
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

  const daemon = new Daemon({ dataDir: hostDir })
  try {
    await daemon.removePact(alias)
  } finally {
    await daemon.stop()
  }
  console.log(`${emoji.brand} ${c.brandBold('Removed')} ${alias}`)
  console.log(`  ${c.ash(`wiped ${entry.dataDir}`)}`)
}
