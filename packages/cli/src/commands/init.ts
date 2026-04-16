import open from 'open'
import { Daemon, config as daemonConfig } from '@openpact/daemon'
import { resolveDataDir, type GlobalCliOpts } from '../lib/data-dir'
import { c, emoji, banner } from '../lib/theme'
import { askText } from '../lib/prompt'
import { suggestPactName, suggestPactPurpose, suggestDisplayName } from '../lib/themes'
import { startCmd } from './start'
import { ApiClient, DaemonNotRunningError } from '../lib/api-client'
import { pidFileLooksAlive, pidPath } from '../lib/pid'

export interface InitOpts {
  force?: boolean
  name?: string
  purpose?: string
  displayName?: string
  /** Optional local alias. Auto-slugged from name if omitted. */
  alias?: string
  /** Commander maps `--no-interactive` to `interactive: false`. */
  interactive?: boolean
  /** Commander maps `--no-start` to `start: false`. Default: auto-start when interactive. */
  start?: boolean
  /** Commander maps `--no-open` to `open: false`. Default: open the browser when auto-started. */
  open?: boolean
  port?: string | number
  dashboardPort?: string | number
}

interface SealedPact {
  pactKey: string
  peerHandle: string
  alias: string
}

export async function initCmd(
  opts: InitOpts,
  cmd: { optsWithGlobals(): GlobalCliOpts },
): Promise<void> {
  const hostDir = resolveDataDir(cmd.optsWithGlobals())

  const nonInteractive = opts.interactive === false
  const pactName = await askText({
    provided: opts.name,
    nonInteractive,
    default: suggestPactName(),
    label: 'Pact name',
    max: 64,
  })
  const pactPurpose = await askText({
    provided: opts.purpose,
    nonInteractive,
    default: suggestPactPurpose(),
    label: 'Purpose',
    max: 200,
  })
  const displayName = await askText({
    provided: opts.displayName,
    nonInteractive,
    default: suggestDisplayName(),
    label: 'Agent name',
    max: 64,
  })

  const chosenAlias = opts.alias ?? autoSlug(pactName) ?? 'default'
  const apiPort = Number(opts.port ?? 7666)

  // Only treat a daemon as "ours" when its PID file lives in the same
  // data dir we're initing into. A stranger daemon on :7666 backing a
  // different host dir can't be allowed to hijack writes meant for the
  // `--data-dir` target.
  const hostApi = new ApiClient({ port: apiPort })
  let daemonAlreadyRunning = false
  if (await pidFileLooksAlive(hostDir)) {
    try {
      await hostApi.ping()
      daemonAlreadyRunning = true
    } catch (err) {
      if (err instanceof DaemonNotRunningError) {
        throw new Error(
          `a daemon for ${hostDir} looks live (PID file at ${pidPath(hostDir)}) but is not responding at http://127.0.0.1:${apiPort}. Pass --port <n> if it's on a different port, or run \`openpact stop\` first.`,
        )
      }
      throw err
    }
  }

  const sealed = daemonAlreadyRunning
    ? await createViaApi(hostApi, {
        alias: chosenAlias,
        pactName,
        pactPurpose,
        displayName,
        force: !!opts.force,
        hostDir,
      })
    : await createInProcess({
        hostDir,
        alias: chosenAlias,
        pactName,
        pactPurpose,
        displayName,
        force: !!opts.force,
      })

  process.stdout.write(banner())
  console.log(`  ${emoji.brand} ${c.brandBold('A pact has been sealed.')}`)
  console.log()
  console.log(`  ${c.brandBold('Pact')}        ${pactName}`)
  console.log(`  ${c.brandBold('Alias')}       ${c.ash(sealed.alias)}`)
  console.log(`  ${c.brandBold('Purpose')}     ${c.ash(pactPurpose)}`)
  console.log(`  ${c.brandBold('Data dir')}    ${c.ash(hostDir)}`)
  console.log(`  ${c.brandBold('Pact key')}    ${c.bone(sealed.pactKey)}`)
  console.log(`  ${c.brandBold('Agent')}       ${displayName} ${c.ash(`(${sealed.peerHandle})`)}`)
  console.log()

  const shouldAutoStart = !daemonAlreadyRunning && opts.start !== false && !!process.stdin.isTTY
  const shouldOpen = opts.open !== false && !!process.stdin.isTTY

  if (daemonAlreadyRunning) {
    console.log(c.ash('  next:  openpact invite              (share the pact key)'))
    console.log(c.ash('         openpact dashboard           (open the dashboard)'))
  } else if (!shouldAutoStart) {
    console.log(c.ash('  next:  openpact start'))
    console.log(c.ash('         openpact invite              (share the pact key)'))
    return
  }

  if (shouldAutoStart) {
    await startCmd({ port: opts.port, dashboardPort: opts.dashboardPort }, cmd)
  }

  if (shouldOpen && (daemonAlreadyRunning || shouldAutoStart)) {
    const dashPort = Number(opts.dashboardPort ?? 7667)
    const url = `http://localhost:${dashPort}`
    try {
      await open(url)
      console.log()
      console.log(c.ash(`  opened ${url} in your default browser`))
    } catch {
      // headless fallback — URL already printed above
    }
  }
}

/**
 * Create a pact against a daemon that's already running on this host.
 * `--force` is handled by a pre-DELETE so the POST can't collide with
 * an existing alias.
 */
async function createViaApi(
  api: ApiClient,
  opts: {
    alias: string
    pactName: string
    pactPurpose: string
    displayName: string
    force: boolean
    hostDir: string
  },
): Promise<SealedPact> {
  if (opts.force) {
    const list = await api.listPacts()
    if (list.pacts.some((p) => p.alias === opts.alias)) {
      await api.deletePact(opts.alias)
    }
  }
  try {
    const res = await api.createPact({
      name: opts.pactName,
      purpose: opts.pactPurpose,
      display_name: opts.displayName,
      alias: opts.alias,
    })
    return {
      pactKey: res.pact_id,
      peerHandle: res.peer_handle ?? '',
      alias: res.alias,
    }
  } catch (err) {
    const e = err as { message?: string }
    if (!opts.force && /already exists/i.test(e.message ?? '')) {
      throw new Error(
        `a pact named ${opts.alias} already exists at ${opts.hostDir}. Pass --force to break it, or --alias <name> to use a different one.`,
      )
    }
    throw err
  }
}

/**
 * Create a pact when no daemon is running: open a short-lived Daemon
 * against the host dir, write the pact to disk, then close so the
 * subsequent auto-start has a clean shot at the corestore.
 */
async function createInProcess(opts: {
  hostDir: string
  alias: string
  pactName: string
  pactPurpose: string
  displayName: string
  force: boolean
}): Promise<SealedPact> {
  const registry = await daemonConfig
    .loadDaemonConfig(opts.hostDir)
    .catch(() => daemonConfig.daemonDefaults())
  const daemon = new Daemon({ dataDir: opts.hostDir })
  const existing = new Set(registry.pacts.map((p) => p.alias))
  if (existing.has(opts.alias)) {
    if (!opts.force) {
      throw new Error(
        `a pact named ${opts.alias} already exists at ${opts.hostDir}. Pass --force to break it, or --alias <name> to use a different one.`,
      )
    }
    await daemon.removePact(opts.alias)
  }
  const { pact, alias } = await daemon.createPact({
    alias: opts.alias,
    pactName: opts.pactName,
    pactPurpose: opts.pactPurpose,
    displayName: opts.displayName,
    setCurrent: true,
  })
  const pactKey = pact.pactKey ?? ''
  const peerHandle = pact.peerHandle ?? ''
  await daemon.stop()
  return { pactKey, peerHandle, alias }
}

function autoSlug(name: string): string | null {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return s || null
}
