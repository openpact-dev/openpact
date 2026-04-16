import { OpenPact, DaemonNotRunningError } from '@openpact/sdk'
import { resolveDataDir, type GlobalCliOpts } from '../lib/data-dir'
import { resolveCurrentPact } from '../lib/pact-select'
import { formatPeers } from '../lib/format'
import { c, emoji } from '../lib/theme'

export interface PeersOpts {
  port?: string | number
  pact?: string
}

export async function peersCmd(
  opts: PeersOpts,
  cmd: { optsWithGlobals(): GlobalCliOpts },
): Promise<void> {
  const dir = resolveDataDir(cmd.optsWithGlobals())
  const pactId = await resolveCurrentPact(dir, opts.pact)
  const client = new OpenPact({ port: Number(opts.port ?? 7666), pactId, hostDir: dir })
  try {
    const peers = await client.peers()
    console.log(formatPeers(peers))
  } catch (err) {
    if (err instanceof DaemonNotRunningError) {
      console.error(`${emoji.cross} ${c.brand('openpact daemon is not running')}`)
      process.exit(1)
    }
    throw err
  }
}
