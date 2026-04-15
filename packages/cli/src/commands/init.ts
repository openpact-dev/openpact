import fs from 'fs/promises'
import { Daemon, config as daemonConfig, dataDir as daemonDataDir } from '@openpact/daemon'
import { resolveDataDir, type GlobalCliOpts } from '../lib/data-dir'
import { c, emoji, banner } from '../lib/theme'
import { askText } from '../lib/prompt'
import { suggestPactName, suggestPactPurpose, suggestDisplayName } from '../lib/themes'

export interface InitOpts {
  force?: boolean
  name?: string
  purpose?: string
  displayName?: string
  /** Commander maps `--no-interactive` to `interactive: false`. */
  interactive?: boolean
}

export async function initCmd(
  opts: InitOpts,
  cmd: { optsWithGlobals(): GlobalCliOpts },
): Promise<void> {
  const dir = resolveDataDir(cmd.optsWithGlobals())

  const cfg = await daemonConfig.loadConfig(dir).catch(() => daemonConfig.defaults())
  if (cfg.pactKey && !opts.force) {
    throw new Error(
      `pact already sealed at ${dir} (key ${cfg.pactKey.slice(0, 12)}…). Pass --force to break it.`,
    )
  }

  if (opts.force) {
    await fs.rm(daemonDataDir.corestorePath(dir), { recursive: true, force: true })
  }

  // Commander sets `interactive: false` for `--no-interactive`; leave
  // undefined (default) to mean "prompt when a TTY is attached."
  const nonInteractive = opts.interactive === false

  // Generate themed defaults once so the same value shows in the
  // prompt initial and falls through silently in non-TTY mode.
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
    label: 'Your name',
    max: 64,
  })

  const daemon = await Daemon.create({
    dataDir: dir,
    pactName,
    pactPurpose,
    displayName,
  })
  try {
    process.stdout.write(banner())
    console.log(`  ${emoji.brand} ${c.brandBold('A pact has been sealed.')}`)
    console.log()
    console.log(`  ${c.brandBold('Pact')}        ${pactName}`)
    console.log(`  ${c.brandBold('Purpose')}     ${c.ash(pactPurpose)}`)
    console.log(`  ${c.brandBold('Data dir')}    ${c.ash(dir)}`)
    console.log(`  ${c.brandBold('Pact key')}    ${c.bone(daemon.pactKey ?? '')}`)
    console.log(`  ${c.brandBold('Your mark')}   ${displayName} ${c.ash(`(${daemon.peerHandle})`)}`)
    console.log()
    console.log(c.ash('  next:  openpact start'))
    console.log(c.ash('         openpact invite              (share the pact key)'))
  } finally {
    await daemon.stop()
  }
}
