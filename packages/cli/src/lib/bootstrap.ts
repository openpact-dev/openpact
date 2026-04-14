export interface BootstrapNode {
  host: string
  port: number
}

/**
 * Parse a bootstrap list from CLI flag or env var format `host:port,host:port`.
 * Empty / undefined input returns null (use the public DHT defaults).
 */
export function parseBootstrap(raw: string | undefined | null): BootstrapNode[] | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  const parts = trimmed
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length === 0) return null
  const out: BootstrapNode[] = []
  for (const part of parts) {
    const idx = part.lastIndexOf(':')
    if (idx === -1) {
      throw new Error(`bootstrap entry must be host:port (got "${part}")`)
    }
    const host = part.slice(0, idx)
    const port = Number(part.slice(idx + 1))
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`invalid bootstrap entry "${part}" — host:port required`)
    }
    out.push({ host, port })
  }
  return out
}

/**
 * Resolve bootstrap from (in order):
 *   1. --bootstrap CLI flag
 *   2. OPENPACT_BOOTSTRAP env var
 *   3. null (use public DHT)
 */
export function resolveBootstrap(flag: string | undefined): BootstrapNode[] | null {
  return parseBootstrap(flag) || parseBootstrap(process.env.OPENPACT_BOOTSTRAP)
}
