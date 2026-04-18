import fs from 'fs/promises'
import path from 'path'

/**
 * Check whether the installed CLI is behind the latest published on
 * npm. One-shot: the caller decides when to print the result. Safe to
 * call on every `openpact start` — it caches for 24h on disk, skips
 * in CI, silently swallows network errors, and races against a short
 * timeout so a slow registry can't block startup.
 *
 * All packages in OpenPact ship lockstep (see CHANGELOG), so checking
 * `@openpact/cli` alone is a truthful stand-in for "am I on the
 * latest release."
 */

export interface VersionCheckOpts {
  /** The version we're comparing against the registry. */
  current: string
  /** Directory to persist the cache file in (usually the data dir). */
  cacheDir: string
  /** Process env; defaults to `process.env`. Kept injectable for tests. */
  env?: NodeJS.ProcessEnv
  /** Fetch impl; defaults to `globalThis.fetch`. Injectable for tests. */
  fetchImpl?: typeof globalThis.fetch
  /** Clock; defaults to `Date.now`. Injectable for tests. */
  now?: () => number
  /** Max ms to wait for the registry before giving up silently. */
  timeoutMs?: number
  /** Npm package name to query. Defaults to `@openpact/cli`. */
  packageName?: string
  /** How long a cached result stays fresh (default 24h). */
  cacheTtlMs?: number
}

export interface VersionCheckResult {
  current: string
  latest: string | null
  /** True when latest > current via the semver-ish compare below. */
  outdated: boolean
  /** True if no actual check was attempted (env opt-out, CI, dev). */
  skipped: boolean
  reason?: 'disabled' | 'ci' | 'dev' | 'cache-hit' | 'fetch-failed' | 'parse-failed'
}

const DEFAULT_TIMEOUT_MS = 1500
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const DEFAULT_PACKAGE = '@openpact/cli'
const CACHE_FILE = 'version-check.json'

interface CacheShape {
  checkedAt: number
  latest: string
}

function skipReason(env: NodeJS.ProcessEnv, current: string): 'disabled' | 'ci' | 'dev' | null {
  if (env.OPENPACT_DISABLE_VERSION_CHECK === '1') return 'disabled'
  // Honour the common "I'm in CI" signal without requiring a new env var.
  if (env.CI) return 'ci'
  // 0.0.0 is the placeholder tsx dev version; a prerelease tag (-dev,
  // -rc, etc.) also isn't a "release" we want to nag users to upgrade.
  if (current === '0.0.0' || current.includes('-')) return 'dev'
  return null
}

async function readCache(file: string): Promise<CacheShape | null> {
  try {
    const raw = await fs.readFile(file, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as CacheShape).checkedAt === 'number' &&
      typeof (parsed as CacheShape).latest === 'string'
    ) {
      return parsed as CacheShape
    }
    return null
  } catch {
    return null
  }
}

async function writeCache(file: string, data: CacheShape): Promise<void> {
  try {
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, JSON.stringify(data), { mode: 0o600 })
  } catch {
    // Non-fatal — caching is a nice-to-have.
  }
}

/**
 * Compare two release versions. Strips any prerelease/build suffix
 * before comparing numeric segments. Returns true if `latest` is
 * strictly newer than `current`.
 */
export function isOutdated(current: string, latest: string): boolean {
  const parse = (v: string): number[] => {
    const core = v.split(/[-+]/, 1)[0]
    return core.split('.').map((s) => {
      const n = Number.parseInt(s, 10)
      return Number.isFinite(n) ? n : 0
    })
  }
  const a = parse(current)
  const b = parse(latest)
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const ai = a[i] ?? 0
    const bi = b[i] ?? 0
    if (bi > ai) return true
    if (bi < ai) return false
  }
  return false
}

export async function checkForUpdate(opts: VersionCheckOpts): Promise<VersionCheckResult> {
  const env = opts.env ?? process.env
  const now = opts.now ?? Date.now
  const pkgName = opts.packageName ?? DEFAULT_PACKAGE
  const ttl = opts.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch

  const skip = skipReason(env, opts.current)
  if (skip) {
    return { current: opts.current, latest: null, outdated: false, skipped: true, reason: skip }
  }

  const cacheFile = path.join(opts.cacheDir, CACHE_FILE)
  const cached = await readCache(cacheFile)
  if (cached && now() - cached.checkedAt < ttl) {
    return {
      current: opts.current,
      latest: cached.latest,
      outdated: isOutdated(opts.current, cached.latest),
      skipped: true,
      reason: 'cache-hit',
    }
  }

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  let latest: string | null = null
  try {
    const res = await fetchImpl(
      `https://registry.npmjs.org/${encodeURIComponent(pkgName)}/latest`,
      { signal: ac.signal, headers: { accept: 'application/json' } },
    )
    if (!res.ok) {
      return {
        current: opts.current,
        latest: null,
        outdated: false,
        skipped: true,
        reason: 'fetch-failed',
      }
    }
    const body = (await res.json()) as { version?: unknown }
    if (typeof body.version !== 'string' || body.version.length === 0) {
      return {
        current: opts.current,
        latest: null,
        outdated: false,
        skipped: true,
        reason: 'parse-failed',
      }
    }
    latest = body.version
  } catch {
    return {
      current: opts.current,
      latest: null,
      outdated: false,
      skipped: true,
      reason: 'fetch-failed',
    }
  } finally {
    clearTimeout(timer)
  }

  await writeCache(cacheFile, { checkedAt: now(), latest })

  return {
    current: opts.current,
    latest,
    outdated: isOutdated(opts.current, latest),
    skipped: false,
  }
}

/**
 * Human-readable warning for the `start` banner. Returns null when
 * there's nothing to say so callers can unconditionally print the
 * return value without special-casing.
 */
export function formatUpdateWarning(result: VersionCheckResult): string | null {
  if (!result.outdated || !result.latest) return null
  return [
    `  OpenPact ${result.latest} is available (you have ${result.current}).`,
    `  Upgrade with: npm i -g @openpact/cli`,
    `  Silence: set OPENPACT_DISABLE_VERSION_CHECK=1`,
  ].join('\n')
}
