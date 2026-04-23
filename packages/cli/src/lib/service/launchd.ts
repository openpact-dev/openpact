import path from 'path'

export interface LaunchdRenderInput {
  /** Absolute path to the openpact binary. */
  binPath: string
  /** OPENPACT_DATA_DIR env. */
  dataDir: string
  /** Extra args after `start --foreground`. */
  extraArgs?: string[]
  /** Absolute log file path for StandardOutPath / StandardErrorPath. */
  logPath: string
}

const LABEL = 'dev.openpact.daemon'

/**
 * Render a launchd LaunchAgent plist supervising `openpact start --foreground`.
 *
 * - RunAtLoad: start immediately on `launchctl load`.
 * - KeepAlive.SuccessfulExit=false: restart on crash, not on clean `openpact stop`.
 * - StandardOut/ErrorPath: pino JSON lines. Useful when journald-less macOS
 *   users tail logs; daemon's own file sink is still at <dataDir>/logs/daemon.log.
 */
export function renderPlist(input: LaunchdRenderInput): string {
  const { binPath, dataDir, logPath } = input
  if (!path.isAbsolute(binPath)) {
    throw new Error(`binPath must be absolute (got ${binPath})`)
  }
  if (!path.isAbsolute(dataDir)) {
    throw new Error(`dataDir must be absolute (got ${dataDir})`)
  }
  if (!path.isAbsolute(logPath)) {
    throw new Error(`logPath must be absolute (got ${logPath})`)
  }

  const args = [binPath, 'start', '--foreground', ...(input.extraArgs ?? [])]
  const programArgs = args.map((a) => `    <string>${xmlEscape(a)}</string>`).join('\n')

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    '  <key>Label</key>',
    `  <string>${LABEL}</string>`,
    '  <key>ProgramArguments</key>',
    '  <array>',
    programArgs,
    '  </array>',
    '  <key>EnvironmentVariables</key>',
    '  <dict>',
    '    <key>OPENPACT_DATA_DIR</key>',
    `    <string>${xmlEscape(dataDir)}</string>`,
    '  </dict>',
    '  <key>RunAtLoad</key>',
    '  <true/>',
    '  <key>KeepAlive</key>',
    '  <dict>',
    '    <key>SuccessfulExit</key>',
    '    <false/>',
    '  </dict>',
    '  <key>StandardOutPath</key>',
    `  <string>${xmlEscape(logPath)}</string>`,
    '  <key>StandardErrorPath</key>',
    `  <string>${xmlEscape(logPath)}</string>`,
    '</dict>',
    '</plist>',
    '',
  ].join('\n')
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export interface LaunchdPaths {
  /** Full absolute path to the .plist. */
  plistPath: string
  /** Directory holding user agents (created if absent). */
  agentDir: string
  /** Label string (dev.openpact.daemon). */
  label: string
  /** Default log path (kept under dataDir so uninstall + data-dir nuke is symmetric). */
  logPath: (dataDir: string) => string
}

export function launchdPaths(homeDir: string): LaunchdPaths {
  const agentDir = path.join(homeDir, 'Library', 'LaunchAgents')
  return {
    agentDir,
    plistPath: path.join(agentDir, `${LABEL}.plist`),
    label: LABEL,
    logPath: (dataDir: string) => path.join(dataDir, 'logs', 'service.log'),
  }
}
