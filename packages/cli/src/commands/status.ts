import { config as daemonConfig } from '@openpact/daemon'
import { OpenPact, DaemonNotRunningError } from '@openpact/sdk'
import { resolveDataDir, type GlobalCliOpts } from '../lib/data-dir'
import { resolveCurrentPact } from '../lib/pact-select'
import { formatHostStatus, formatStatus, type StatusContext } from '../lib/format'
import { readPidFile } from '../lib/pid'
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
  const apiPort = Number(opts.port ?? 7666)
  const dashboardPort = Number(opts.dashboardPort ?? 7667)

  const registry = await daemonConfig.loadDaemonConfig(dir).catch(() => null)
  const pid = await readPidFile(dir)
  const explicitPact = opts.pact?.trim() || process.env.OPENPACT_PACT?.trim() || null
  const hasAnyPacts = (registry?.pacts.length ?? 0) > 0
  const hostClient = new OpenPact({ port: apiPort, hostDir: dir })

  if (!explicitPact && !hasAnyPacts) {
    try {
      const hostStatus = await hostClient.hostStatus()
      console.log(
        formatHostStatus(hostStatus, {
          totalPacts: registry?.pacts.length ?? hostStatus.pact_count,
          currentAlias: registry?.currentAlias ?? hostStatus.current,
          apiPort,
          dashboardPort,
          dataDir: dir,
          pid,
        }),
      )
      return
    } catch (err) {
      if (err instanceof DaemonNotRunningError) {
        console.error(`${emoji.cross} ${c.brand('OpenPact daemon is not running.')}`)
        console.error(`  ${c.ash('Data dir')}    ${c.ash(dir)}`)
        console.error(`  ${c.ash('Summon it')}   openpact start`)
        process.exit(1)
      }
      throw err
    }
  }

  const pactId = await resolveCurrentPact(dir, opts.pact)
  const ctx: StatusContext = {
    alias: pactId,
    totalPacts: registry?.pacts.length ?? 0,
    currentAlias: registry?.currentAlias ?? null,
    apiPort,
    dashboardPort,
    dataDir: dir,
    pid,
  }

  const client = new OpenPact({ port: apiPort, pactId, hostDir: dir })
  try {
    const status = await client.status()
    console.log(formatStatus(status, ctx))
  } catch (err) {
    if (err instanceof DaemonNotRunningError) {
      console.error(`${emoji.cross} ${c.brand('OpenPact daemon is not running.')}`)
      console.error(`  ${c.ash('Data dir')}    ${c.ash(dir)}`)
      console.error(`  ${c.ash('Pact')}        ${c.ash(pactId)}`)
      console.error(`  ${c.ash('Summon it')}   openpact start`)
      process.exit(1)
    }
    throw err
  }
}
