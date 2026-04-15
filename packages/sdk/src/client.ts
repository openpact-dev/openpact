import { mapHttpError, mapNetworkError } from './errors'

export interface ClientOpts {
  /** Full base URL. Wins over host/port if both are given. */
  baseUrl?: string
  /** Port for the daemon. Default 7666. */
  port?: number
  /** Host for the daemon. Default 127.0.0.1. */
  host?: string
  /** Custom fetch implementation. Default: globalThis.fetch (Node 20+). */
  fetch?: typeof globalThis.fetch
}

export type FetchInit = Parameters<typeof globalThis.fetch>[1]

const DEFAULT_PORT = 7666
const DEFAULT_HOST = '127.0.0.1'

export class OpenPactClient {
  baseUrl: string
  private fetchImpl: typeof globalThis.fetch

  constructor(opts: ClientOpts = {}) {
    this.baseUrl =
      opts.baseUrl ?? `http://${opts.host ?? DEFAULT_HOST}:${opts.port ?? DEFAULT_PORT}`
    // Browsers reject `fetch` when invoked as a method of anything but
    // the global object ("Illegal invocation"). Binding to globalThis
    // makes the stored reference callable from a class field.
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis)
  }

  async req<T>(path: string, init?: FetchInit): Promise<T> {
    let res: Response
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, init)
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

export function buildQuery(params: Record<string, unknown>): string {
  const usp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    usp.set(k, String(v))
  }
  const qs = usp.toString()
  return qs ? `?${qs}` : ''
}
