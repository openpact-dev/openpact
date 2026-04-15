import { config as daemonConfig } from '@openpact/daemon'
import { resolveDataDir, type GlobalCliOpts } from '../lib/data-dir'
import { resolveCurrentPact } from '../lib/pact-select'
import { ApiClient, DaemonNotRunningError } from '../lib/api-client'
import { formatStatus, type StatusContext } from '../lib/format'
import { c, emoji } from '../lib/theme'

export interface StatusOpts {
  port?: string | number
  /** Pact alias to query. Defaults to the host's currentAlias. */
  pact?: string
  /** Dashboard port for the link line. Defaults to 7667. */
  dashboardPort?: string | number
}

export async function statusCmd(
  opts: StatusOpts,
  cmd: { optsWithGlobals(): GlobalCliOpts },
): Promise<void> {
  const dir = resolveDataDir(cmd.optsWithGlobals())
  const pactId = await resolveCurrentPact(dir, opts.pact)
  const apiPort = Number(opts.port ?? 7666)
  const dashboardPort = Number(opts.dashboardPort ?? 7667)

  const registry = await daemonConfig.loadDaemonConfig(dir).catch(() => null)
  const ctx: StatusContext = {
    alias: pactId,
    totalPacts: registry?.pacts.length ?? 0,
    currentAlias: registry?.currentAlias ?? null,
    apiPort,
    dashboardPort,
    dataDir: dir,
  }

  const api = new ApiClient({ port: apiPort, pactId })
  try {
    const status = await api.status()
    console.log(formatStatus(status, ctx))
  } catch (err) {
    if (err instanceof DaemonNotRunningError) {
      console.error(`${emoji.cross} ${c.brand('openpact daemon is not running')}`)
      console.error(c.ash(`  data dir   ${dir}`))
      console.error(c.ash(`  pact       ${pactId}`))
      console.error(c.ash(`  summon it  openpact start`))
      process.exit(1)
    }
    throw err
  }
}
