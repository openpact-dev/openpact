import { resolveDataDir, type GlobalCliOpts } from '../lib/data-dir'
import { ApiClient, DaemonNotRunningError } from '../lib/api-client'
import { formatStatus } from '../lib/format'
import { c, emoji } from '../lib/theme'

export interface StatusOpts {
  port?: string | number
}

export async function statusCmd(
  opts: StatusOpts,
  cmd: { optsWithGlobals(): GlobalCliOpts },
): Promise<void> {
  const dir = resolveDataDir(cmd.optsWithGlobals())
  const api = new ApiClient({ port: Number(opts.port ?? 7666) })
  try {
    const status = await api.status()
    console.log(formatStatus(status))
  } catch (err) {
    if (err instanceof DaemonNotRunningError) {
      console.error(`${emoji.cross} ${c.brand('openpact daemon is not running')}`)
      console.error(c.ash(`  data dir   ${dir}`))
      console.error(c.ash(`  summon it  openpact start --daemon`))
      process.exit(1)
    }
    throw err
  }
}
