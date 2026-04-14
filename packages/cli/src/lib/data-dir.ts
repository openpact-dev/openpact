import { dataDir as daemonDataDir } from '@openpact/daemon'

export interface GlobalCliOpts {
  dataDir?: string
}

/**
 * Resolve the data dir from (in order):
 *   1. --data-dir flag (commander parent option)
 *   2. OPENPACT_DATA_DIR env var
 *   3. defaultDataDir() (~/.openpact)
 */
export function resolveDataDir(opts: GlobalCliOpts = {}): string {
  return opts.dataDir || daemonDataDir.defaultDataDir()
}
