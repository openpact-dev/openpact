import fs from 'fs'
import os from 'os'

export type Supervisor = 'systemd' | 'launchd'

export interface Platform {
  supervisor: Supervisor
  /** Linux hosts that are actually WSL2 get their own label so we can print WSL-specific hints. */
  isWsl2: boolean
}

export interface DetectInput {
  platform?: NodeJS.Platform
  /** Path to read for the WSL2 kernel signature. Default /proc/version. */
  procVersionPath?: string
}

/**
 * Detect which service supervisor this host uses.
 *
 * Returns null when the platform has no supported supervisor. Throws nothing —
 * callers decide how to surface the skip (error out, print a hint, skip
 * postinstall silently).
 */
export function detectPlatform(input: DetectInput = {}): Platform | null {
  const platform = input.platform ?? process.platform
  if (platform === 'darwin') return { supervisor: 'launchd', isWsl2: false }
  if (platform === 'linux') {
    return { supervisor: 'systemd', isWsl2: isWsl2(input.procVersionPath) }
  }
  return null
}

export function isWsl2(procVersionPath = '/proc/version'): boolean {
  try {
    const s = fs.readFileSync(procVersionPath, 'utf8')
    return /microsoft/i.test(s) && /wsl/i.test(s)
  } catch {
    return false
  }
}

export interface RunningAsRoot {
  isRoot: boolean
  sudoUser: string | null
}

export function runningAsRoot(): RunningAsRoot {
  const uid = typeof process.getuid === 'function' ? process.getuid() : null
  return {
    isRoot: uid === 0,
    sudoUser: process.env.SUDO_USER ?? null,
  }
}

export function homeDir(): string {
  return os.homedir()
}
