import { Daemon, config as daemonConfig } from '@openpact/daemon'
import { resolveDataDir, type GlobalCliOpts } from '../lib/data-dir'
import { c, emoji } from '../lib/theme'
import { askText } from '../lib/prompt'
import { suggestDisplayName } from '../lib/themes'

export interface JoinOpts {
  force?: boolean
  displayName?: string
  alias?: string
  interactive?: boolean
}

export async function joinCmd(
  joinKey: string,
  opts: JoinOpts,
  cmd: { optsWithGlobals(): GlobalCliOpts },
): Promise<void> {
  if (!/^[0-9a-f]+$/i.test(joinKey)) {
    throw new Error(`join key must be hex (got ${joinKey.slice(0, 16)}…)`)
  }
  const hostDir = resolveDataDir(cmd.optsWithGlobals())

  const nonInteractive = opts.interactive === false
  const displayName = await askText({
    provided: opts.displayName,
    nonInteractive,
    default: suggestDisplayName(),
    label: 'Agent name',
    max: 64,
  })

  const registry = await daemonConfig
    .loadDaemonConfig(hostDir)
    .catch(() => daemonConfig.daemonDefaults())
  const daemon = new Daemon({ dataDir: hostDir })

  const chosenAlias = opts.alias ?? `joined-${joinKey.slice(0, 8)}`
  const existing = new Set(registry.pacts.map((p) => p.alias))
  if (existing.has(chosenAlias)) {
    if (!opts.force) {
      throw new Error(
        `a pact named ${chosenAlias} already exists at ${hostDir}. Pass --force to break it, or --alias <name>.`,
      )
    }
    await daemon.removePact(chosenAlias)
  }

  const { pact, alias } = await daemon.joinPact({
    alias: chosenAlias,
    joinKey,
    displayName,
    setCurrent: true,
  })
  try {
    console.log()
    console.log(`  ${emoji.brand} ${c.brandBold('Agent bound to the pact.')}`)
    console.log()
    console.log(`  ${c.brandBold('Alias')}       ${c.ash(alias)}`)
    console.log(`  ${c.brandBold('Data dir')}    ${c.ash(hostDir)}`)
    console.log(`  ${c.brandBold('Pact key')}    ${c.bone(pact.pactKey ?? '')}`)
    console.log(`  ${c.brandBold('Agent')}       ${displayName} ${c.ash(`(${pact.peerHandle})`)}`)
    console.log()
    console.log(
      c.ash(
        '  next:  openpact start    (the creator must bind this agent as a writer before it can post entries)',
      ),
    )
  } finally {
    await daemon.stop()
  }
}
