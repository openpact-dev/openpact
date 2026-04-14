import { ApiClient, DaemonNotRunningError } from '../lib/api-client'
import { formatPeers } from '../lib/format'
import { c } from '../lib/theme'

export interface PeersOpts {
  port?: string | number
}

export async function peersCmd(opts: PeersOpts): Promise<void> {
  const api = new ApiClient({ port: Number(opts.port ?? 7331) })
  try {
    const peers = await api.peers()
    console.log(formatPeers(peers))
  } catch (err) {
    if (err instanceof DaemonNotRunningError) {
      console.error(c.brand('✗ openpact daemon is not running'))
      process.exit(1)
    }
    throw err
  }
}
