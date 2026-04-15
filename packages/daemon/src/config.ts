import fs from 'fs/promises'
import { configPath } from './data-dir'

export const DEFAULT_PORT = 7666

export const ROLES = ['creator', 'indexer', 'writer', 'reader'] as const
export type Role = (typeof ROLES)[number]

export const DISPLAY_NAME_MAX = 64
export const PACT_NAME_MAX = 64
export const PACT_PURPOSE_MAX = 200

export interface Config {
  pactKey: string | null
  /** Human-readable name for this pact, chosen at init. Null if unset. */
  pactName: string | null
  /** One-line statement of what this pact is for. Null if unset. */
  pactPurpose: string | null
  /** Author's chosen display name for entries. Null means use peerHandle. */
  displayName: string | null
  role: Role | null
  port: number
}

export function defaults(): Config {
  return {
    pactKey: null,
    pactName: null,
    pactPurpose: null,
    displayName: null,
    role: null,
    port: DEFAULT_PORT,
  }
}

export async function loadConfig(dataDir: string): Promise<Config> {
  const file = configPath(dataDir)
  let raw: string
  try {
    raw = await fs.readFile(file, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return defaults()
    throw err
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new Error(`config file at ${file} is not valid JSON: ${(err as Error).message}`)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`config file at ${file} must contain a JSON object`)
  }
  return { ...defaults(), ...(parsed as Partial<Config>) }
}

export async function saveConfig(dataDir: string, config: Config): Promise<void> {
  validate(config)
  await fs.mkdir(dataDir, { recursive: true })
  const file = configPath(dataDir)
  const tmp = file + '.tmp'
  await fs.writeFile(tmp, JSON.stringify(config, null, 2) + '\n', 'utf8')
  await fs.rename(tmp, file)
}

export function validate(config: Config): void {
  if (config === null || typeof config !== 'object') {
    throw new TypeError('config must be an object')
  }
  if (config.role !== null && config.role !== undefined && !ROLES.includes(config.role as Role)) {
    throw new Error(`invalid role: ${config.role}`)
  }
  if (config.pactKey !== null && config.pactKey !== undefined) {
    if (typeof config.pactKey !== 'string' || !/^[0-9a-f]+$/i.test(config.pactKey)) {
      throw new Error('pactKey must be a hex string or null')
    }
  }
  if (typeof config.port !== 'number' || config.port < 1 || config.port > 65535) {
    throw new Error('port must be an integer in [1, 65535]')
  }
  validateOptionalString(config.pactName, 'pactName', PACT_NAME_MAX)
  validateOptionalString(config.pactPurpose, 'pactPurpose', PACT_PURPOSE_MAX)
  validateOptionalString(config.displayName, 'displayName', DISPLAY_NAME_MAX)
}

function validateOptionalString(value: unknown, field: string, max: number): void {
  if (value === null || value === undefined) return
  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string or null`)
  }
  if (value.length > max) {
    throw new Error(`${field} must be ≤${max} chars`)
  }
}
