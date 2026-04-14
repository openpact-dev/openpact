import fs from 'fs/promises'
import { Daemon, config as daemonConfig, dataDir as daemonDataDir } from '@openpact/daemon'
import { resolveDataDir, type GlobalCliOpts } from '../lib/data-dir'
import { c, emoji } from '../lib/theme'

export interface JoinOpts {
  force?: boolean
}

export async function joinCmd(
  joinKey: string,
  opts: JoinOpts,
  cmd: { optsWithGlobals(): GlobalCliOpts },
): Promise<void> {
  if (!/^[0-9a-f]+$/i.test(joinKey)) {
    throw new Error(`join key must be hex (got ${joinKey.slice(0, 16)}…)`)
  }
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

  const daemon = await Daemon.join({ dataDir: dir, joinKey })
  try {
    console.log()
    console.log(`  ${emoji.brand} ${c.brandBold('You have entered the pact.')}`)
    console.log()
    console.log(`  ${c.brandBold('Data dir')}    ${c.ash(dir)}`)
    console.log(`  ${c.brandBold('Pact key')}    ${c.bone(daemon.pactKey ?? '')}`)
    console.log(`  ${c.brandBold('Your mark')}   ${daemon.peerHandle}`)
    console.log()
    console.log(
      c.ash('  next:  openpact start    (the creator must bind you as a writer to write entries)'),
    )
  } finally {
    await daemon.stop()
  }
}
