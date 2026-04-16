import { mapHttpError, mapNetworkError } from './errors'

export interface ClientOpts {
  /** Full base URL. Wins over host/port if both are given. */
  baseUrl?: string
  /** Port for the daemon. Default 7666. */
  port?: number
  /** Host for the daemon. Default 127.0.0.1. */
  host?: string
  /**
   * Which pact this client's per-pact resources (knowledge, tasks,
   * skills, messages, entries, admin) operate on. Either a short
   * alias or the 64-hex pactId. Required for every resource other
   * than `pacts.*` and `ping()` — scope must be explicit so a client
   * never silently writes to the "wrong" pact.
   */
  pactId?: string
  /** Custom fetch implementation. Default: globalThis.fetch (Node 22+). */
  fetch?: typeof globalThis.fetch
  /**
   * Bearer token for the daemon's local REST API. Required for every
   * endpoint other than /v1/ping, /v1/healthz, /v1/readyz. In Node,
   * if omitted, the SDK will attempt to read the token from
   * `~/.openpact/daemon.json` the first time it's needed; set this
   * to `false` (or pass a custom `fetch`) to opt out. In the browser
   * the caller must supply the token explicitly — the dashboard
   * obtains it from the process that spawned the page.
   */
  token?: string | null | false
  /**
   * Host data dir to search for `daemon.json` when `token` is not set.
   * Node only. Defaults to `~/.openpact`.
   */
  hostDir?: string
}

export type FetchInit = Parameters<typeof globalThis.fetch>[1]

const DEFAULT_PORT = 7666
const DEFAULT_HOST = '127.0.0.1'

export class OpenPactClient {
  baseUrl: string
  pactId: string | null
  private fetchImpl: typeof globalThis.fetch
  private explicitToken: string | null | false | undefined
  private hostDir: string | undefined
  private autoDiscoverToken: boolean
  private tokenPromise: Promise<string | null> | undefined

  constructor(opts: ClientOpts = {}) {
    this.baseUrl =
      opts.baseUrl ?? `http://${opts.host ?? DEFAULT_HOST}:${opts.port ?? DEFAULT_PORT}`
    this.pactId = opts.pactId ?? null
    // Browsers reject `fetch` when invoked as a method of anything but
    // the global object ("Illegal invocation"). Binding to globalThis
    // makes the stored reference callable from a class field.
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis)
    this.explicitToken = opts.token
    this.hostDir = opts.hostDir
    // Auto-discovery is only on when the caller isn't supplying a
    // custom fetch (tests, advanced use) and didn't explicitly opt
    // out. Forcing `token: null` or `token: false` disables it too.
    // Passing `hostDir` re-enables discovery even with a custom fetch.
    this.autoDiscoverToken =
      this.explicitToken === undefined && (opts.hostDir !== undefined || opts.fetch === undefined)
  }

  /**
   * Build a per-pact URL path. Callers pass everything after
   * `/v1/pacts/:pactId/` (e.g. `/knowledge`, `/tasks/${id}/claim`)
   * and this prepends the scope. Throws when no pactId is configured.
   */
  pactPath(suffix: string): string {
    if (!this.pactId) {
      throw new Error(
        'OpenPact client has no pactId set; per-pact resources are unavailable. Pass `pactId` to the constructor or use client.pacts.* for host-level endpoints.',
      )
    }
    return `/v1/pacts/${encodeURIComponent(this.pactId)}${suffix}`
  }

  /**
   * Resolve the bearer token to attach to outgoing requests.
   *   - When the constructor got `token: string`, use it verbatim.
   *   - When `token` is `false` or `null`, don't attach any header.
   *   - Otherwise, in Node, look up `~/.openpact/daemon.json`
   *     (or `<hostDir>/daemon.json`) and cache the result.
   *   - In a non-Node environment, there's nothing to auto-read, so
   *     return null. The request will go unauthenticated and the
   *     daemon will 401 unless the caller supplied a token.
   */
  private async resolveToken(): Promise<string | null> {
    if (typeof this.explicitToken === 'string') return this.explicitToken
    if (this.explicitToken === false || this.explicitToken === null) return null
    if (!this.autoDiscoverToken) return null
    if (!isNodeRuntime()) return null
    // Don't cache misses — `daemon.json` may not exist yet when a
    // caller is auto-starting the daemon (e.g. `openpact join` on a
    // cold host). Caching `null` here would poison every later call
    // after the daemon writes the file on first boot.
    if (this.tokenPromise) {
      const cached = await this.tokenPromise
      if (cached) return cached
    }
    this.tokenPromise = readTokenFromDisk(this.hostDir).catch(() => null)
    return this.tokenPromise
  }

  async req<T>(path: string, init?: FetchInit): Promise<T> {
    const token = await this.resolveToken()
    const headers = new Headers((init as RequestInit | undefined)?.headers ?? undefined)
    if (token && !headers.has('authorization')) {
      headers.set('authorization', `Bearer ${token}`)
    }
    const mergedInit: FetchInit = { ...(init as RequestInit | undefined), headers }
    let res: Response
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, mergedInit)
    } catch (err) {
      throw mapNetworkError(err, this.baseUrl)
    }
    const body = (await res.json().catch(() => null)) as unknown
    if (!res.ok) throw mapHttpError(res.status, body)
    return body as T
  }

  async json<T>(path: string, method: 'POST' | 'PUT' | 'DELETE', body?: unknown): Promise<T> {
    return this.req<T>(path, {
      method,
      headers: body !== undefined ? { 'content-type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  }
}

function isNodeRuntime(): boolean {
  return (
    typeof process !== 'undefined' &&
    !!(process as unknown as { versions?: { node?: string } }).versions?.node
  )
}

async function readTokenFromDisk(hostDir: string | undefined): Promise<string | null> {
  // Lazy-load Node-only modules so bundlers (vite, esbuild) targeting
  // the browser don't pull `fs` and `os` into the client bundle.
  const { readFile } = await import('node:fs/promises')
  const os = await import('node:os')
  const path = await import('node:path')
  const dir = hostDir ?? path.join(os.homedir(), '.openpact')
  const file = path.join(dir, 'daemon.json')
  let raw: string
  try {
    raw = await readFile(file, 'utf8')
  } catch {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as { apiToken?: unknown }
    return typeof parsed.apiToken === 'string' && /^[0-9a-f]{64}$/i.test(parsed.apiToken)
      ? parsed.apiToken
      : null
  } catch {
    return null
  }
}

export function buildQuery(params: Record<string, unknown>): string {
  const usp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    usp.set(k, String(v))
  }
  const qs = usp.toString()
  return qs ? `?${qs}` : ''
}
