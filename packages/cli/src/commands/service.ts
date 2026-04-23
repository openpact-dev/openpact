import { Command } from 'commander'
import path from 'path'
import { resolveDataDir, type GlobalCliOpts } from '../lib/data-dir'
import {
  install as serviceInstall,
  uninstall as serviceUninstall,
  status as serviceStatus,
  logs as serviceLogs,
} from '../lib/service'
import { c, emoji } from '../lib/theme'

interface InstallOpts {
  bin?: string
  port?: string | number
  dashboardPort?: string | number
  noDashboard?: boolean
  logLevel?: string
}

interface LogsOpts {
  lines?: string | number
}

/**
 * Register `openpact service <verb>` on the parent program. Called once from
 * bin.ts.
 *
 * Supervisors: systemd (--user) on Linux + WSL2, launchd (LaunchAgent) on
 * macOS. Windows and everything else refuse with a clear message.
 */
export function registerServiceCommand(parent: Command): void {
  const service = parent
    .command('service')
    .description('install openpact as a background service (systemd / launchd)')

  service
    .command('install')
    .description('write the supervisor unit, enable it, and start it')
    .option(
      '--bin <path>',
      'absolute path to the openpact binary (default: the path this CLI was invoked from)',
    )
    .option('--port <n>', 'REST API port', '7666')
    .option('--dashboard-port <n>', 'dashboard port', '7667')
    .option('--no-dashboard', 'skip the dashboard')
    .option('--log-level <level>', 'pino log level (fatal|error|warn|info|debug|trace|silent)')
    .action((opts: InstallOpts, cmd: { optsWithGlobals(): GlobalCliOpts }) => installCmd(opts, cmd))

  service
    .command('uninstall')
    .description('stop the service, disable it, and remove the unit file')
    .action(() => uninstallCmd())

  service
    .command('status')
    .description('show whether the service is installed, enabled, and active')
    .action(() => statusCmd())

  service
    .command('logs')
    .description('tail the service supervisor log')
    .option('--lines <n>', 'number of lines to show', '200')
    .action((opts: LogsOpts) => logsCmd(opts))
}

async function installCmd(
  opts: InstallOpts,
  cmd: { optsWithGlobals(): GlobalCliOpts },
): Promise<void> {
  const dataDir = resolveDataDir(cmd.optsWithGlobals())
  const binPath = resolveBin(opts.bin)

  const extraArgs: string[] = []
  if (opts.port && String(opts.port) !== '7666') extraArgs.push('--port', String(opts.port))
  if (opts.noDashboard) extraArgs.push('--no-dashboard')
  if (opts.dashboardPort && String(opts.dashboardPort) !== '7667') {
    extraArgs.push('--dashboard-port', String(opts.dashboardPort))
  }
  if (opts.logLevel) extraArgs.push('--log-level', opts.logLevel)

  const result = await serviceInstall({ binPath, dataDir, extraArgs })

  console.log(`  ${emoji.flame} ${c.brandBold('Sealed')} ${c.bone('service unit')}`)
  console.log(`  ${c.ash(result.unitPath)}`)
  if (result.linger) {
    if (result.linger.ok) {
      console.log(`  ${c.ash('· loginctl enable-linger: on (WSL2 auto-start after VM boot)')}`)
    } else {
      console.log(
        `  ${c.ember('· loginctl enable-linger failed')} ${c.ash(result.linger.message ?? '')}`,
      )
      console.log(
        `    ${c.ash('run `sudo loginctl enable-linger $USER` so it starts after WSL2 reboots.')}`,
      )
    }
  }
  if (result.started) {
    console.log(`  ${c.ash('· started. openpact service status to verify.')}`)
  } else {
    console.log(`  ${c.ember('· service unit installed but failed to start:')}`)
    console.log(`    ${c.ash(result.startError ?? '(no error detail)')}`)
    process.exitCode = 1
  }
}

async function uninstallCmd(): Promise<void> {
  const result = await serviceUninstall()
  if (result.removed) {
    console.log(`  ${emoji.bones} ${c.brandBold('Banished')} ${c.bone('service unit')}`)
    console.log(`  ${c.ash(result.unitPath)}`)
  } else {
    console.log(`  ${c.ash('No service unit was installed at')} ${c.bone(result.unitPath)}`)
  }
}

async function statusCmd(): Promise<void> {
  const s = await serviceStatus()
  const state = !s.installed
    ? c.ash('not installed')
    : s.active
      ? c.spark('active')
      : c.ember('installed, not active')
  const enabled =
    s.enabled === true ? c.spark('enabled') : s.enabled === false ? c.ember('disabled') : c.ash('—')
  console.log(
    `  ${emoji.brand} ${c.brandBold('Service')}  ${state}  ${c.ash('·')} ${enabled}  ${c.ash(`(${s.platform.supervisor}${s.platform.isWsl2 ? ', wsl2' : ''})`)}`,
  )
  if (s.detail.trim()) {
    console.log('')
    console.log(s.detail.trimEnd())
  }
}

async function logsCmd(opts: LogsOpts): Promise<void> {
  const n = Number(opts.lines ?? 200)
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`--lines must be a positive integer (got ${opts.lines})`)
  }
  const out = await serviceLogs(n)
  process.stdout.write(out.endsWith('\n') ? out : `${out}\n`)
}

function resolveBin(override: string | undefined): string {
  if (override) {
    if (!path.isAbsolute(override)) {
      throw new Error(`--bin must be an absolute path (got ${override})`)
    }
    return override
  }
  // argv[1] is the script node was asked to run. For `npm install -g @openpact/cli`
  // this is the resolved bin shim (e.g. /usr/local/bin/openpact), which is what
  // we want to bake into the unit file. In dev (tsx) it's a .ts path — the
  // install layer rejects that with a clearer error than a systemd boot failure.
  const entry = process.argv[1]
  if (!entry) {
    throw new Error('cannot detect openpact binary path; pass --bin <absolute path>')
  }
  return path.resolve(entry)
}
