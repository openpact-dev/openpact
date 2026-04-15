import { config as daemonConfig } from '@openpact/daemon'
import { resolveDataDir, type GlobalCliOpts } from '../lib/data-dir'

export interface InviteOpts {
  /** Print the key of this specific pact (by alias). Defaults to the host's currentAlias. */
  pact?: string
}

export async function inviteCmd(
  opts: InviteOpts,
  cmd: { optsWithGlobals(): GlobalCliOpts },
): Promise<void> {
  const hostDir = resolveDataDir(cmd.optsWithGlobals())
  const registry = await daemonConfig.loadDaemonConfig(hostDir).catch(() => null)
  if (!registry || registry.pacts.length === 0) {
    throw new Error(`no pacts at ${hostDir} — run \`openpact init\` first`)
  }
  const alias = opts.pact ?? registry.currentAlias ?? registry.pacts[0]?.alias
  const entry = registry.pacts.find((p) => p.alias === alias)
  if (!entry) {
    throw new Error(
      `no pact named ${alias} at ${hostDir}. known: ${registry.pacts.map((p) => p.alias).join(', ')}`,
    )
  }
  // Just the key, one line, no decoration. Easy to pipe / copy.
  process.stdout.write(entry.pactId + '\n')
}
