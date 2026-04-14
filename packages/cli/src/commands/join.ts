import fs from 'fs/promises'
import { Daemon, config as daemonConfig, dataDir as daemonDataDir } from '@openpact/daemon'
import pc from 'picocolors'
import { resolveDataDir, type GlobalCliOpts } from '../lib/data-dir'

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
      `pact already initialised at ${dir} (key ${cfg.pactKey.slice(0, 12)}…). Pass --force to overwrite.`,
    )
  }

  if (opts.force) {
    await fs.rm(daemonDataDir.corestorePath(dir), { recursive: true, force: true })
  }

  const daemon = await Daemon.join({ dataDir: dir, joinKey })
  try {
    console.log(pc.green('Pact joined.'))
    console.log(`  ${pc.bold('Data dir:')}   ${dir}`)
    console.log(`  ${pc.bold('Pact key:')}   ${daemon.pactKey}`)
    console.log(`  ${pc.bold('Your handle:')} ${daemon.peerHandle}`)
    console.log()
    console.log(
      pc.dim(
        'Next: openpact start (the creator must promote you with openpact-cli addWriter eventually)',
      ),
    )
  } finally {
    await daemon.stop()
  }
}
