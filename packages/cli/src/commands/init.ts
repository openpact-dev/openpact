import fs from 'fs/promises'
import { Daemon, config as daemonConfig, dataDir as daemonDataDir } from '@openpact/daemon'
import pc from 'picocolors'
import { resolveDataDir, type GlobalCliOpts } from '../lib/data-dir'

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
      `pact already initialised at ${dir} (key ${cfg.pactKey.slice(0, 12)}…). Pass --force to overwrite.`,
    )
  }

  if (opts.force) {
    // Wipe Corestore data so the new pact starts fresh.
    await fs.rm(daemonDataDir.corestorePath(dir), { recursive: true, force: true })
  }

  const daemon = await Daemon.create({ dataDir: dir })
  try {
    console.log(pc.green('Pact created.'))
    console.log(`  ${pc.bold('Data dir:')}   ${dir}`)
    console.log(`  ${pc.bold('Pact key:')}   ${daemon.pactKey}`)
    console.log(`  ${pc.bold('Your handle:')} ${daemon.peerHandle}`)
    console.log()
    console.log(pc.dim('Next:'))
    console.log(pc.dim('  openpact start                  # foreground'))
    console.log(pc.dim('  openpact start --daemon         # background'))
    console.log(pc.dim('  openpact invite                 # share the pact key'))
  } finally {
    await daemon.stop()
  }
}
