import fs from 'fs/promises'
import path from 'path'
import { detectPlatform, homeDir, runningAsRoot, type Platform } from './platform'
import { renderUnit, systemdPaths } from './systemd'
import { renderPlist, launchdPaths } from './launchd'
import { run as realRun, type ExecResult } from './exec'

export { detectPlatform, runningAsRoot } from './platform'
export type { Platform } from './platform'

export type Runner = (bin: string, args: string[]) => Promise<ExecResult>

export interface ServiceDeps {
  /** Process runner. Tests pass a fake; production uses real child_process. */
  run?: Runner
  /** Home directory override. Tests pass a tmpdir; production uses os.homedir(). */
  home?: string
  /** Platform override. Tests force systemd/launchd codepaths without caring about host OS. */
  platform?: Platform
}

export interface ServiceConfig {
  /** Absolute path to the `openpact` binary to bake into the unit. */
  binPath: string
  /** Absolute data dir (OPENPACT_DATA_DIR). */
  dataDir: string
  /** Extra args appended to `start --foreground` (e.g. ["--port", "7777"]). */
  extraArgs?: string[]
}

export interface InstallResult {
  unitPath: string
  platform: Platform
  /** systemd only: whether `loginctl enable-linger` was attempted and its outcome. */
  linger?: { attempted: boolean; ok: boolean; message?: string }
  /** Whether start succeeded. On failure the unit is still installed. */
  started: boolean
  startError?: string
}

export interface StatusResult {
  platform: Platform
  installed: boolean
  active: boolean
  enabled: boolean | null
  /** Last few lines of the supervisor's view (systemctl status / launchctl print). */
  detail: string
}

/**
 * Write, enable, and start the service. Throws if the platform is unsupported,
 * if running as root on a system with per-user supervisors, or if the bin
 * path looks like a dev-mode TS entry.
 */
export async function install(cfg: ServiceConfig, deps: ServiceDeps = {}): Promise<InstallResult> {
  const platform = deps.platform ?? requirePlatform()
  requireNotRoot()
  assertBinUsable(cfg.binPath)
  const { run, home } = resolveDeps(deps)

  if (platform.supervisor === 'systemd') {
    return installSystemd(cfg, platform, run, home)
  }
  return installLaunchd(cfg, platform, run, home)
}

/**
 * Stop, disable, and remove the unit file. Idempotent: missing units are a
 * success, not an error.
 */
export async function uninstall(
  deps: ServiceDeps = {},
): Promise<{ removed: boolean; unitPath: string; platform: Platform }> {
  const platform = deps.platform ?? requirePlatform()
  requireNotRoot()
  const { run, home } = resolveDeps(deps)

  if (platform.supervisor === 'systemd') {
    const { unitPath, unitName } = systemdPaths(home)
    await run('systemctl', ['--user', 'stop', unitName])
    await run('systemctl', ['--user', 'disable', unitName])
    const removed = await unlinkIfExists(unitPath)
    await run('systemctl', ['--user', 'daemon-reload'])
    return { removed, unitPath, platform }
  }

  const { plistPath, label } = launchdPaths(home)
  await run('launchctl', ['unload', plistPath]).catch(() => undefined)
  await run('launchctl', ['remove', label]).catch(() => undefined)
  const removed = await unlinkIfExists(plistPath)
  return { removed, unitPath: plistPath, platform }
}

export async function status(deps: ServiceDeps = {}): Promise<StatusResult> {
  const platform = deps.platform ?? requirePlatform()
  const { run, home } = resolveDeps(deps)

  if (platform.supervisor === 'systemd') {
    const { unitPath, unitName } = systemdPaths(home)
    const installed = await exists(unitPath)
    const active = (await run('systemctl', ['--user', 'is-active', unitName])).code === 0
    const enabledRes = await run('systemctl', ['--user', 'is-enabled', unitName])
    const enabled = enabledRes.code === 0 ? true : null
    const detail = (await run('systemctl', ['--user', 'status', unitName, '--no-pager'])).stdout
    return { platform, installed, active, enabled, detail }
  }

  const { plistPath, label } = launchdPaths(home)
  const installed = await exists(plistPath)
  const listed = await run('launchctl', ['list', label])
  const active = listed.code === 0 && /PID/i.test(listed.stdout)
  return {
    platform,
    installed,
    active,
    enabled: installed,
    detail: listed.stdout || listed.stderr,
  }
}

export async function logs(lines: number, deps: ServiceDeps = {}): Promise<string> {
  const platform = deps.platform ?? requirePlatform()
  const { run, home } = resolveDeps(deps)

  if (platform.supervisor === 'systemd') {
    const { unitName } = systemdPaths(home)
    const res = await run('journalctl', [
      '--user',
      '-u',
      unitName,
      '-n',
      String(lines),
      '--no-pager',
    ])
    if (res.code !== 0 && !res.stdout) {
      throw new Error(res.stderr.trim() || `journalctl exited with code ${res.code}`)
    }
    return res.stdout
  }
  const { logPath } = launchdPaths(home)
  const file = logPath(dataDirFromEnv(home))
  try {
    const buf = await fs.readFile(file, 'utf8')
    const all = buf.split('\n')
    return all.slice(-lines).join('\n')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return `(no log file yet at ${file})`
    }
    throw err
  }
}

async function installSystemd(
  cfg: ServiceConfig,
  platform: Platform,
  run: Runner,
  home: string,
): Promise<InstallResult> {
  const { unitDir, unitPath, unitName } = systemdPaths(home)
  const unit = renderUnit({ binPath: cfg.binPath, dataDir: cfg.dataDir, extraArgs: cfg.extraArgs })
  await fs.mkdir(unitDir, { recursive: true })
  await fs.writeFile(unitPath, unit, { mode: 0o644 })

  await run('systemctl', ['--user', 'daemon-reload'])

  // WSL2 boots headless; without linger, the user unit is torn down on logout
  // and never started on VM boot. Try to turn it on; don't fail the install if
  // loginctl is unavailable or the user lacks perms.
  let linger: InstallResult['linger']
  if (platform.isWsl2) {
    const res = await run('loginctl', ['enable-linger', currentUser()])
    linger = {
      attempted: true,
      ok: res.code === 0,
      message: res.code === 0 ? undefined : res.stderr.trim() || `exit ${res.code}`,
    }
  }

  const enable = await run('systemctl', ['--user', 'enable', '--now', unitName])
  const started = enable.code === 0
  const startError = started ? undefined : enable.stderr.trim() || `exit ${enable.code}`

  return { unitPath, platform, linger, started, startError }
}

async function installLaunchd(
  cfg: ServiceConfig,
  platform: Platform,
  run: Runner,
  home: string,
): Promise<InstallResult> {
  const { agentDir, plistPath, logPath } = launchdPaths(home)
  const plist = renderPlist({
    binPath: cfg.binPath,
    dataDir: cfg.dataDir,
    extraArgs: cfg.extraArgs,
    logPath: logPath(cfg.dataDir),
  })
  await fs.mkdir(agentDir, { recursive: true })
  await fs.mkdir(path.dirname(logPath(cfg.dataDir)), { recursive: true })
  await fs.writeFile(plistPath, plist, { mode: 0o644 })

  // Unload first in case a stale plist with the same label is loaded.
  await run('launchctl', ['unload', plistPath]).catch(() => undefined)
  const load = await run('launchctl', ['load', '-w', plistPath])
  const started = load.code === 0
  const startError = started ? undefined : load.stderr.trim() || `exit ${load.code}`
  return { unitPath: plistPath, platform, started, startError }
}

function requirePlatform(): Platform {
  const platform = detectPlatform()
  if (!platform) {
    throw new Error(
      `openpact service is not yet supported on ${process.platform}. Supported: linux, darwin.`,
    )
  }
  return platform
}

function requireNotRoot(): void {
  const { isRoot, sudoUser } = runningAsRoot()
  if (!isRoot) return
  const hint = sudoUser
    ? `Re-run without sudo as user '${sudoUser}'.`
    : 'Re-run as the user that will own the daemon (no sudo).'
  throw new Error(
    `openpact service install manages a per-user supervisor unit and cannot run as root. ${hint}`,
  )
}

export function assertBinUsable(binPath: string): void {
  if (!path.isAbsolute(binPath)) {
    throw new Error(`--bin must be an absolute path (got ${binPath})`)
  }
  if (/\.[mc]?tsx?$/i.test(binPath)) {
    throw new Error(
      `--bin '${binPath}' is a TypeScript entry; the service needs an installed binary. ` +
        `Install with 'npm install -g @openpact/cli' and re-run, or pass --bin /abs/path/to/openpact.`,
    )
  }
}

function resolveDeps(deps: ServiceDeps): { run: Runner; home: string } {
  return {
    run: deps.run ?? realRun,
    home: deps.home ?? homeDir(),
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function unlinkIfExists(p: string): Promise<boolean> {
  try {
    await fs.unlink(p)
    return true
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw err
  }
}

function currentUser(): string {
  return process.env.USER ?? process.env.LOGNAME ?? ''
}

function dataDirFromEnv(home: string): string {
  return process.env.OPENPACT_DATA_DIR ?? path.join(home, '.openpact')
}
