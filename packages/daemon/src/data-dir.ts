import os from 'os'
import path from 'path'

const DEFAULT_DIR_NAME = '.openpact'

export function defaultDataDir(): string {
  return process.env.OPENPACT_DATA_DIR || path.join(os.homedir(), DEFAULT_DIR_NAME)
}

export function configPath(dataDir: string): string {
  return path.join(dataDir, 'config.json')
}

export function corestorePath(dataDir: string): string {
  return path.join(dataDir, 'data')
}

export function pidPath(dataDir: string): string {
  return path.join(dataDir, 'pid')
}
