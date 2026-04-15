import fs from 'fs/promises'
import open from 'open'
import { Daemon, config as daemonConfig, dataDir as daemonDataDir } from '@openpact/daemon'
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
  /** Commander maps `--no-interactive` to `interactive: false`. */
  interactive?: boolean
  /** Commander maps `--no-start` to `start: false`. Default: auto-start when interactive. */
  start?: boolean
  /** Commander maps `--no-open` to `open: false`. Default: open the browser when auto-started. */
  open?: boolean
  /** Optional port overrides forwarded to auto-start. */
  port?: string | number
  dashboardPort?: string | number
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
  const pactKey = daemon.pactKey ?? ''
  const peerHandle = daemon.peerHandle ?? ''
  // Stop the init-owned daemon before auto-start tries to spawn a
  // detached process against the same Corestore.
  await daemon.stop()

  process.stdout.write(banner())
  console.log(`  ${emoji.brand} ${c.brandBold('A pact has been sealed.')}`)
  console.log()
  console.log(`  ${c.brandBold('Pact')}        ${pactName}`)
  console.log(`  ${c.brandBold('Purpose')}     ${c.ash(pactPurpose)}`)
  console.log(`  ${c.brandBold('Data dir')}    ${c.ash(dir)}`)
  console.log(`  ${c.brandBold('Pact key')}    ${c.bone(pactKey)}`)
  console.log(`  ${c.brandBold('Your mark')}   ${displayName} ${c.ash(`(${peerHandle})`)}`)
  console.log()

  // Auto-start: on when stdin is a TTY (interactive run), off otherwise
  // (CI / piped). `--no-start` always disables regardless. Commander
  // maps `--no-start` to `start: false` and defaults to `true`, so we
  // only look for the explicit `false` here — the TTY check decides
  // the default.
  const shouldAutoStart = opts.start !== false && !!process.stdin.isTTY
  if (!shouldAutoStart) {
    console.log(c.ash('  next:  openpact start'))
    console.log(c.ash('         openpact invite              (share the pact key)'))
    return
  }

  await startCmd(
    {
      port: opts.port,
      dashboardPort: opts.dashboardPort,
    },
    cmd,
  )

  const shouldOpen = opts.open !== false
  if (shouldOpen) {
    const dashPort = Number(opts.dashboardPort ?? 7667)
    const url = `http://localhost:${dashPort}`
    try {
      await open(url)
      console.log()
      console.log(c.ash(`  opened ${url} in your default browser`))
    } catch {
      // `open` can fail in headless environments (no DISPLAY, WSL
      // without wslview, etc.). Fall through silently — the URL
      // is already in the banner above.
    }
  }
}
