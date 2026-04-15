import { Daemon, config as daemonConfig } from '@openpact/daemon'
import { resolveDataDir, type GlobalCliOpts } from '../lib/data-dir'
import { c, emoji } from '../lib/theme'

/**
 * `openpact switch <alias>` — change which pact is "current" on this
 * host. Writes daemon.json.currentAlias; the running daemon (if any)
 * picks this up on its next registry read. Commands that default to
 * the current pact will route to the new alias.
 */
export async function switchCmd(
  alias: string,
  _opts: unknown,
  cmd: { optsWithGlobals(): GlobalCliOpts },
): Promise<void> {
  const hostDir = resolveDataDir(cmd.optsWithGlobals())
  const registry = await daemonConfig.loadDaemonConfig(hostDir).catch(() => null)
  if (!registry || registry.pacts.length === 0) {
    throw new Error(`no pacts at ${hostDir}. run \`openpact init\` first.`)
  }
  const entry = registry.pacts.find((p) => p.alias === alias)
  if (!entry) {
    const known = registry.pacts.map((p) => p.alias).join(', ') || '(none)'
    throw new Error(`no pact named ${alias}. known: ${known}`)
  }
  if (registry.currentAlias === alias) {
    console.log(c.ash(`already on ${alias}.`))
    return
  }

  // Apply via the Daemon so validation runs. We don't need to
  // daemon.start() — this only touches daemon.json.
  const daemon = new Daemon({ dataDir: hostDir })
  await daemon.setCurrentAlias(alias)
  console.log(`${emoji.brand} ${c.brandBold('Switched to')} ${alias}`)
  console.log(`  ${c.ash(`pact_id ${entry.pactId.slice(0, 12)}…`)}`)
}
