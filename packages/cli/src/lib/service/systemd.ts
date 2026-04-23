import path from 'path'

export interface SystemdRenderInput {
  /** Absolute path to the openpact binary (the `openpact` shim on PATH). */
  binPath: string
  /** OPENPACT_DATA_DIR env var (so the unit and CLI agree on ~/.openpact). */
  dataDir: string
  /** Extra args appended after `start --foreground` (e.g. --port 7666). */
  extraArgs?: string[]
  /** Optional description override (useful for tests). */
  description?: string
}

const UNIT_NAME = 'openpact.service'

/**
 * Render a systemd user unit that supervises `openpact start --foreground`.
 *
 * - Type=simple: the daemon stays attached; systemd tracks the main pid.
 * - Restart=on-failure: restart on crashes, but not on a clean `systemctl stop`
 *   or `openpact stop` (which exits 0).
 * - WantedBy=default.target: enabled into the user's default boot target so it
 *   comes back on VM boot when `loginctl enable-linger` is on.
 */
export function renderUnit(input: SystemdRenderInput): string {
  const { binPath, dataDir } = input
  if (!path.isAbsolute(binPath)) {
    throw new Error(`binPath must be absolute (got ${binPath})`)
  }
  if (!path.isAbsolute(dataDir)) {
    throw new Error(`dataDir must be absolute (got ${dataDir})`)
  }

  const description = input.description ?? 'OpenPact daemon (P2P shared memory for agents)'
  const args = [
    escapeArg(binPath),
    'start',
    '--foreground',
    ...(input.extraArgs ?? []).map(escapeArg),
  ]
  const execStart = args.join(' ')

  return [
    '[Unit]',
    `Description=${description}`,
    'Documentation=https://openpact.dev',
    'After=network-online.target',
    'Wants=network-online.target',
    '',
    '[Service]',
    'Type=simple',
    `Environment=OPENPACT_DATA_DIR=${escapeEnv(dataDir)}`,
    `ExecStart=${execStart}`,
    'Restart=on-failure',
    'RestartSec=5s',
    // Keep stdout/stderr on journald (pino JSON lines are still captured by
    // the daemon's own file sink at <dataDir>/logs/daemon.log).
    'StandardOutput=journal',
    'StandardError=journal',
    '',
    '[Install]',
    'WantedBy=default.target',
    '',
  ].join('\n')
}

/**
 * systemd.exec(5) treats the ExecStart value as a simple whitespace-split
 * command line. Any whitespace, backslash, or quote in an arg needs escaping.
 * We quote anything that isn't a bare token.
 */
function escapeArg(arg: string): string {
  if (/^[A-Za-z0-9_\-./:=@+]+$/.test(arg)) return arg
  return `"${arg.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/**
 * systemd.exec(5) Environment= values with whitespace need quotes. Simple path
 * values without whitespace or '=' don't.
 */
function escapeEnv(value: string): string {
  if (/^[A-Za-z0-9_\-./:@+]+$/.test(value)) return value
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

export interface SystemdPaths {
  /** Full absolute path to the unit file. */
  unitPath: string
  /** Directory holding user units (created if absent). */
  unitDir: string
  /** Unit name with suffix (openpact.service). */
  unitName: string
}

export function systemdPaths(homeDir: string): SystemdPaths {
  const unitDir = path.join(homeDir, '.config', 'systemd', 'user')
  return {
    unitDir,
    unitPath: path.join(unitDir, UNIT_NAME),
    unitName: UNIT_NAME,
  }
}
