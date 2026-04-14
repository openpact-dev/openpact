import fs from 'fs/promises'
import { Daemon, config as daemonConfig, dataDir as daemonDataDir } from '@openpact/daemon'
import { resolveDataDir, type GlobalCliOpts } from '../lib/data-dir'
import { c, glyph, banner } from '../lib/theme'

export interface InitOpts {
  force?: boolean
}

export async function initCmd(
  opts: InitOpts,
  cmd: { optsWithGlobals(): GlobalCliOpts },
): Promise<void> {
  const dir = resolveDataDir(cmd.optsWithGlobals())

  // Check whether a pact already exists at this dir.
  const cfg = await daemonConfig.loadConfig(dir).catch(() => daemonConfig.defaults())
  if (cfg.pactKey && !opts.force) {
    throw new Error(
      `pact already sealed at ${dir} (key ${cfg.pactKey.slice(0, 12)}…). Pass --force to break it.`,
    )
  }

  if (opts.force) {
    // Wipe Corestore data so the new pact starts fresh.
    await fs.rm(daemonDataDir.corestorePath(dir), { recursive: true, force: true })
  }

  const daemon = await Daemon.create({ dataDir: dir })
  try {
    process.stdout.write(banner())
    console.log(`  ${c.brand(glyph.seal)} ${c.brandBold('A pact has been sealed.')}`)
    console.log()
    console.log(`  ${c.brandBold('Data dir')}    ${c.ash(dir)}`)
    console.log(`  ${c.brandBold('Pact key')}    ${c.bone(daemon.pactKey ?? '')}`)
    console.log(`  ${c.brandBold('Your mark')}   ${daemon.peerHandle}`)
    console.log()
    console.log(c.ash(`  next ${glyph.arrow} openpact start --daemon`))
    console.log(c.ash(`       openpact invite                 (share the pact key)`))
  } finally {
    await daemon.stop()
  }
}
