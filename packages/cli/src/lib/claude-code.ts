import fs from 'fs/promises'
import path from 'path'

/**
 * Marker we embed in every OpenPact-owned hook entry so re-installs can
 * find and replace them without touching unrelated user-written hooks
 * in the same file.
 */
export const OPENPACT_MARKER = 'openpact-managed:v1'

export interface ClaudeHookCommand {
  type: 'command'
  command: string
  timeout?: number
}

export interface ClaudeHookGroup {
  matcher?: string
  hooks: ClaudeHookCommand[]
  /** Our own field; Claude Code ignores unknown fields. Used to find and replace on re-install. */
  [OPENPACT_MARKER]?: true
}

export interface ClaudeSettings {
  hooks?: Partial<Record<string, ClaudeHookGroup[]>>
  [key: string]: unknown
}

export interface MergeOptions {
  alias: string
  /** Override the default `openpact` binary name (for tests and non-global installs). */
  binCmd?: string
  /** When true, overwrite an existing OpenPact-managed group even if its alias differs. */
  force?: boolean
}

export interface MergeResult {
  settings: ClaudeSettings
  /** Human-readable list of what changed. Empty = no-op. */
  changes: string[]
  /** True when an existing OpenPact group was left untouched because force=false. */
  skippedExisting: boolean
}

/**
 * Build the set of hook groups OpenPact installs. Kept as a pure
 * function so tests can compare shapes without a filesystem.
 */
export function buildOpenpactHooks(
  alias: string,
  binCmd = 'openpact',
): Record<string, ClaudeHookGroup> {
  const sessionStart: ClaudeHookGroup = {
    hooks: [
      {
        type: 'command',
        command: `${binCmd} hook session-start --pact ${alias}`,
        timeout: 5,
      },
    ],
    [OPENPACT_MARKER]: true,
  }
  const promptSubmit: ClaudeHookGroup = {
    hooks: [
      {
        type: 'command',
        command: `${binCmd} hook prompt-submit --pact ${alias}`,
        timeout: 3,
      },
    ],
    [OPENPACT_MARKER]: true,
  }
  return { SessionStart: sessionStart, UserPromptSubmit: promptSubmit }
}

/**
 * Load a Claude Code settings file. Missing file → empty settings.
 * Malformed JSON throws with the path so the user can fix it. Non-object
 * top-level values throw for the same reason.
 */
export async function loadSettings(file: string): Promise<ClaudeSettings> {
  let raw: string
  try {
    raw = await fs.readFile(file, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw err
  }
  const trimmed = raw.trim()
  if (trimmed === '') return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new Error(`${file} is not valid JSON: ${(err as Error).message}`)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${file} must contain a JSON object at the top level`)
  }
  return parsed as ClaudeSettings
}

/**
 * Merge OpenPact's hook groups into an existing Claude Code settings
 * object. Preserves every unrelated key. Replaces an existing
 * OpenPact-managed group in-place (found via the marker); skips it when
 * `force` is false and the baked command would be different.
 */
export function mergeSettings(existing: ClaudeSettings, opts: MergeOptions): MergeResult {
  const { alias, binCmd, force = false } = opts
  const additions = buildOpenpactHooks(alias, binCmd)
  const next: ClaudeSettings = { ...existing }
  const hooks: Partial<Record<string, ClaudeHookGroup[]>> = { ...(next.hooks ?? {}) }
  next.hooks = hooks
  const changes: string[] = []
  let skippedExisting = false

  for (const [event, group] of Object.entries(additions)) {
    const current = hooks[event] ? [...hooks[event]!] : []
    const ourIndex = current.findIndex((g) => g && g[OPENPACT_MARKER] === true)
    if (ourIndex === -1) {
      current.push(group)
      changes.push(`added ${event} hook for pact "${alias}"`)
    } else {
      const existingGroup = current[ourIndex]
      const sameCommand =
        existingGroup.hooks?.[0]?.command === group.hooks[0].command &&
        existingGroup.hooks?.[0]?.timeout === group.hooks[0].timeout
      if (sameCommand) {
        // No-op; already in sync.
        continue
      }
      if (!force) {
        skippedExisting = true
        changes.push(`kept existing ${event} hook (use --force to replace)`)
        continue
      }
      current[ourIndex] = group
      changes.push(`updated ${event} hook for pact "${alias}"`)
    }
    hooks[event] = current
  }

  return { settings: next, changes, skippedExisting }
}

/**
 * Serialise settings back to the on-disk format: 2-space indent,
 * trailing newline. Claude Code writes its own settings with 2-space
 * indent; match that to keep diffs clean.
 */
export function serialiseSettings(settings: ClaudeSettings): string {
  return JSON.stringify(settings, null, 2) + '\n'
}

/** Resolve the settings.json path for a project directory. */
export function settingsPath(projectDir: string): string {
  return path.join(projectDir, '.claude', 'settings.json')
}

/** Atomic write: tmp file + rename, so a crashed edit never leaves a truncated file. */
export async function writeSettings(file: string, settings: ClaudeSettings): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = file + '.tmp'
  await fs.writeFile(tmp, serialiseSettings(settings), 'utf8')
  await fs.rename(tmp, file)
}
