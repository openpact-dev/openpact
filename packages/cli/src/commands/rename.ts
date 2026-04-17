import { Daemon, config as daemonConfig } from '@openpact/daemon'
import { resolveDataDir, type GlobalCliOpts } from '../lib/data-dir'
import { c, emoji } from '../lib/theme'
import { short } from '../lib/format'

/**
 * `openpact rename <oldAlias> <newAlias>` — change a pact's local
 * alias. The pact_id (the hex key other peers know it by) is unchanged.
 *
 * Renaming moves the on-disk directory too, so callers holding an
 * absolute path in daemon.json get rewritten automatically. A running
 * daemon should be stopped first if it holds the pact open, or it
 * will see a silent rename under its feet.
 */
export async function renameCmd(
  oldAlias: string,
  newAlias: string,
  _opts: unknown,
  cmd: { optsWithGlobals(): GlobalCliOpts },
): Promise<void> {
  const hostDir = resolveDataDir(cmd.optsWithGlobals())
  const registry = await daemonConfig.loadDaemonConfig(hostDir).catch(() => null)
  if (!registry || registry.pacts.length === 0) {
    throw new Error(`no pacts at ${hostDir}.`)
  }
  const entry = registry.pacts.find((p) => p.alias === oldAlias)
  if (!entry) {
    const known = registry.pacts.map((p) => p.alias).join(', ') || '(none)'
    throw new Error(`no pact named ${oldAlias}. known: ${known}`)
  }
  if (registry.pacts.some((p) => p.alias === newAlias)) {
    throw new Error(`a pact named ${newAlias} already exists on this host.`)
  }

  const daemon = new Daemon({ dataDir: hostDir })
  try {
    await daemon.renamePact(oldAlias, newAlias)
  } finally {
    await daemon.stop()
  }
  console.log(
    `  ${emoji.brand} ${c.brandBold('Renamed')} ${c.bone(oldAlias)} ${c.ash('→')} ${c.bone(newAlias)}`,
  )
  console.log(`  ${c.ash(`pact_id ${short(entry.pactId, 12)}… (unchanged)`)}`)
}
