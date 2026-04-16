import fs from 'fs/promises'
import { daemonConfigPath, pactConfigPath, pactConfigDir, pactsRoot } from './data-dir'

export const DEFAULT_PORT = 7666

export const ROLES = ['creator', 'indexer', 'member'] as const
export type Role = (typeof ROLES)[number]

export const DISPLAY_NAME_MAX = 64
export const PACT_NAME_MAX = 64
export const PACT_PURPOSE_MAX = 200

// ──────────────────────────────────────────────────────────────────────
// PactConfig — one per pact, lives at <hostDir>/pacts/<alias>/config.json
// ──────────────────────────────────────────────────────────────────────

export interface PactConfig {
  pactKey: string | null
  pactName: string | null
  pactPurpose: string | null
  displayName: string | null
  role: Role | null
}

export function pactDefaults(): PactConfig {
  return {
    pactKey: null,
    pactName: null,
    pactPurpose: null,
    displayName: null,
    role: null,
  }
}

export async function loadPactConfig(pactDir: string): Promise<PactConfig> {
  const file = pactConfigPath(pactDir)
  let raw: string
  try {
    raw = await fs.readFile(file, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return pactDefaults()
    throw err
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new Error(`pact config at ${file} is not valid JSON: ${(err as Error).message}`)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`pact config at ${file} must contain a JSON object`)
  }
  const merged = { ...pactDefaults(), ...(parsed as Partial<PactConfig>) }
  return {
    ...merged,
    role: normaliseRole(merged.role),
  }
}

export async function savePactConfig(pactDir: string, config: PactConfig): Promise<void> {
  validatePactConfig(config)
  await fs.mkdir(pactDir, { recursive: true })
  const file = pactConfigPath(pactDir)
  const tmp = file + '.tmp'
  await fs.writeFile(tmp, JSON.stringify(config, null, 2) + '\n', 'utf8')
  await fs.rename(tmp, file)
}

export function validatePactConfig(config: PactConfig): void {
  if (config === null || typeof config !== 'object') {
    throw new TypeError('pact config must be an object')
  }
  if (config.role !== null && config.role !== undefined && !ROLES.includes(config.role as Role)) {
    throw new Error(`invalid role: ${config.role}`)
  }
  if (config.pactKey !== null && config.pactKey !== undefined) {
    if (typeof config.pactKey !== 'string' || !/^[0-9a-f]+$/i.test(config.pactKey)) {
      throw new Error('pactKey must be a hex string or null')
    }
  }
  validateOptionalString(config.pactName, 'pactName', PACT_NAME_MAX)
  validateOptionalString(config.pactPurpose, 'pactPurpose', PACT_PURPOSE_MAX)
  validateOptionalString(config.displayName, 'displayName', DISPLAY_NAME_MAX)
}

// ──────────────────────────────────────────────────────────────────────
// DaemonConfig — host-level, lives at <hostDir>/daemon.json
// ──────────────────────────────────────────────────────────────────────

export interface PactRegistryEntry {
  /** Short alias used by CLI + dashboard. Slug of pactName when auto-generated. */
  alias: string
  /** The pact's canonical 64-hex key. Stable across renames. */
  pactId: string
  /** Absolute path to this pact's directory inside pactsRoot(hostDir). */
  dataDir: string
  /** ISO timestamp when the pact was first added to this host. */
  addedAt: string
}

export interface DaemonConfig {
  /** REST API port the host binds on. Default: DEFAULT_PORT. */
  port: number
  /** Every pact the host knows about (open or not). */
  pacts: PactRegistryEntry[]
  /** Alias of the "current" pact — the one that /v1/pacts/current resolves to. */
  currentAlias: string | null
}

export function daemonDefaults(): DaemonConfig {
  return { port: DEFAULT_PORT, pacts: [], currentAlias: null }
}

export async function loadDaemonConfig(hostDir: string): Promise<DaemonConfig> {
  const file = daemonConfigPath(hostDir)
  let raw: string
  try {
    raw = await fs.readFile(file, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return daemonDefaults()
    throw err
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new Error(`daemon config at ${file} is not valid JSON: ${(err as Error).message}`)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`daemon config at ${file} must contain a JSON object`)
  }
  return { ...daemonDefaults(), ...(parsed as Partial<DaemonConfig>) }
}

export async function saveDaemonConfig(hostDir: string, config: DaemonConfig): Promise<void> {
  validateDaemonConfig(config)
  await fs.mkdir(hostDir, { recursive: true })
  const file = daemonConfigPath(hostDir)
  const tmp = file + '.tmp'
  await fs.writeFile(tmp, JSON.stringify(config, null, 2) + '\n', 'utf8')
  await fs.rename(tmp, file)
}

export function validateDaemonConfig(config: DaemonConfig): void {
  if (config === null || typeof config !== 'object') {
    throw new TypeError('daemon config must be an object')
  }
  if (typeof config.port !== 'number' || config.port < 1 || config.port > 65535) {
    throw new Error('port must be an integer in [1, 65535]')
  }
  if (!Array.isArray(config.pacts)) {
    throw new Error('pacts must be an array')
  }
  const aliases = new Set<string>()
  for (const p of config.pacts) {
    if (!p.alias || typeof p.alias !== 'string') {
      throw new Error('pact entry missing alias')
    }
    if (aliases.has(p.alias)) {
      throw new Error(`duplicate alias: ${p.alias}`)
    }
    aliases.add(p.alias)
    if (!p.pactId || !/^[0-9a-f]+$/i.test(p.pactId)) {
      throw new Error(`pact entry ${p.alias} has invalid pactId`)
    }
    if (!p.dataDir || typeof p.dataDir !== 'string') {
      throw new Error(`pact entry ${p.alias} missing dataDir`)
    }
  }
  if (config.currentAlias !== null && !aliases.has(config.currentAlias)) {
    throw new Error(`currentAlias ${config.currentAlias} is not in the pacts list`)
  }
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

function normaliseRole(value: unknown): Role | null {
  if (value === 'writer') return 'member'
  if (value === 'reader') return null
  if (value === null || value === undefined) return null
  return value as Role
}

// re-export path helpers so callers can `import * as config` and reach
// the filesystem layout from one place.
export { daemonConfigPath, pactConfigPath, pactConfigDir, pactsRoot }
