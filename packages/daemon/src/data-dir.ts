import os from 'os'
import path from 'path'

const DEFAULT_DIR_NAME = '.openpact'

/**
 * Host directory — holds daemon.json plus a pacts/ subdir with one
 * subdirectory per pact.
 *
 *   ~/.openpact/
 *   ├── daemon.json           # DaemonConfig: port, pacts list, currentAlias
 *   ├── pid                   # daemon process id
 *   ├── daemon.log            # detached-start log
 *   └── pacts/
 *       ├── iron-compact/
 *       │   ├── config.json   # PactConfig
 *       │   └── data/         # corestore
 *       └── smoke-pact/
 *           └── …
 */
export function defaultDataDir(): string {
  return process.env.OPENPACT_DATA_DIR || path.join(os.homedir(), DEFAULT_DIR_NAME)
}

export function daemonConfigPath(hostDir: string): string {
  return path.join(hostDir, 'daemon.json')
}

export function pactsRoot(hostDir: string): string {
  return path.join(hostDir, 'pacts')
}

export function pactConfigDir(hostDir: string, alias: string): string {
  return path.join(pactsRoot(hostDir), alias)
}

export function pactConfigPath(pactDir: string): string {
  return path.join(pactDir, 'config.json')
}

export function pactStorePath(pactDir: string): string {
  return path.join(pactDir, 'data')
}

export function pactInvitesPath(pactDir: string): string {
  return path.join(pactDir, 'invites.json')
}

export function pidPath(hostDir: string): string {
  return path.join(hostDir, 'pid')
}
