import open from 'open'
import { Daemon, config as daemonConfig } from '@openpact/daemon'
import { resolveDataDir, type GlobalCliOpts } from '../lib/data-dir'
import { c, emoji, banner } from '../lib/theme'
import { askText } from '../lib/prompt'
import { suggestPactName, suggestPactPurpose, suggestDisplayName } from '../lib/themes'
import { startCmd } from './start'

export interface InitOpts {
  force?: boolean
  name?: string
  purpose?: string
  displayName?: string
  /** Optional local alias. Auto-slugged from name if omitted. */
  alias?: string
  /** Commander maps `--no-interactive` to `interactive: false`. */
  interactive?: boolean
  /** Commander maps `--no-start` to `start: false`. Default: auto-start when interactive. */
  start?: boolean
  /** Commander maps `--no-open` to `open: false`. Default: open the browser when auto-started. */
  open?: boolean
  port?: string | number
  dashboardPort?: string | number
}

export async function initCmd(
  opts: InitOpts,
  cmd: { optsWithGlobals(): GlobalCliOpts },
): Promise<void> {
  const hostDir = resolveDataDir(cmd.optsWithGlobals())

  const nonInteractive = opts.interactive === false
  const pactName = await askText({
    provided: opts.name,
    nonInteractive,
    default: suggestPactName(),
    label: 'Pact name',
    max: 64,
  })
  const pactPurpose = await askText({
    provided: opts.purpose,
    nonInteractive,
    default: suggestPactPurpose(),
    label: 'Purpose',
    max: 200,
  })
  const displayName = await askText({
    provided: opts.displayName,
    nonInteractive,
    default: suggestDisplayName(),
    label: 'Agent name',
    max: 64,
  })

  // Load the host registry. If there's already a pact under the
  // requested alias and --force is set, remove it first; otherwise
  // refuse. `default` is the fallback when the user gives no alias.
  const registry = await daemonConfig
    .loadDaemonConfig(hostDir)
    .catch(() => daemonConfig.daemonDefaults())
  const daemon = new Daemon({ dataDir: hostDir })

  // Resolve the alias now so the "force" path has a precise target.
  // Daemon.createPact will auto-slug if we pass undefined, but we
  // want --force to work against the same alias it would have created.
  const existing = new Set(registry.pacts.map((p) => p.alias))
  const chosenAlias = opts.alias ?? autoSlug(pactName) ?? 'default'
  if (existing.has(chosenAlias)) {
    if (!opts.force) {
      throw new Error(
        `a pact named ${chosenAlias} already exists at ${hostDir}. Pass --force to break it, or --alias <name> to use a different one.`,
      )
    }
    await daemon.removePact(chosenAlias)
  }

  const { pact, alias } = await daemon.createPact({
    alias: chosenAlias,
    pactName,
    pactPurpose,
    displayName,
    setCurrent: true,
  })
  const pactKey = pact.pactKey ?? ''
  const peerHandle = pact.peerHandle ?? ''
  // Close the init-owned pact + host before auto-start spawns a
  // detached process against the same corestore.
  await daemon.stop()

  process.stdout.write(banner())
  console.log(`  ${emoji.brand} ${c.brandBold('A pact has been sealed.')}`)
  console.log()
  console.log(`  ${c.brandBold('Pact')}        ${pactName}`)
  console.log(`  ${c.brandBold('Alias')}       ${c.ash(alias)}`)
  console.log(`  ${c.brandBold('Purpose')}     ${c.ash(pactPurpose)}`)
  console.log(`  ${c.brandBold('Data dir')}    ${c.ash(hostDir)}`)
  console.log(`  ${c.brandBold('Pact key')}    ${c.bone(pactKey)}`)
  console.log(`  ${c.brandBold('Agent')}       ${displayName} ${c.ash(`(${peerHandle})`)}`)
  console.log()

  const shouldAutoStart = opts.start !== false && !!process.stdin.isTTY
  if (!shouldAutoStart) {
    console.log(c.ash('  next:  openpact start'))
    console.log(c.ash('         openpact invite              (share the pact key)'))
    return
  }

  await startCmd({ port: opts.port, dashboardPort: opts.dashboardPort }, cmd)

  const shouldOpen = opts.open !== false
  if (shouldOpen) {
    const dashPort = Number(opts.dashboardPort ?? 7667)
    const url = `http://localhost:${dashPort}`
    try {
      await open(url)
      console.log()
      console.log(c.ash(`  opened ${url} in your default browser`))
    } catch {
      // headless fallback — URL already printed above
    }
  }
}

function autoSlug(name: string): string | null {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return s || null
}
