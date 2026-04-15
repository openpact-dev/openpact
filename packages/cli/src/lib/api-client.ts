export interface ApiClientOpts {
  port?: number
  host?: string
  /** Pact alias or 64-hex id. Required for per-pact reads/writes. Default: 'default'. */
  pactId?: string
}

export class DaemonNotRunningError extends Error {
  constructor(public url: string) {
    super(`could not reach openpact daemon at ${url}`)
    this.name = 'DaemonNotRunningError'
  }
}

export class ApiClient {
  base: string
  pactId: string

  constructor({ port = 7666, host = '127.0.0.1', pactId = 'default' }: ApiClientOpts = {}) {
    this.base = `http://${host}:${port}`
    this.pactId = pactId
  }

  private pactPath(suffix: string): string {
    return `/v1/pacts/${encodeURIComponent(this.pactId)}${suffix}`
  }

  private async req(path: string, init: RequestInit = {}): Promise<any> {
    let res: Response
    try {
      res = await fetch(`${this.base}${path}`, init)
    } catch (err) {
      // Node fetch wraps low-level errors as TypeError('fetch failed')
      // with the underlying error on .cause.
      const cause = (err as { cause?: NodeJS.ErrnoException })?.cause
      const code = cause?.code ?? (err as NodeJS.ErrnoException)?.code
      if (
        code === 'ECONNREFUSED' ||
        /ECONNREFUSED/.test((err as Error).message ?? '') ||
        /ECONNREFUSED/.test(cause?.message ?? '')
      ) {
        throw new DaemonNotRunningError(this.base)
      }
      throw err
    }
    const body = (await res.json().catch(() => null)) as any
    if (!res.ok) {
      const msg = body?.message || `HTTP ${res.status}`
      const code = body?.error || 'HTTP_ERROR'
      const e: any = new Error(msg)
      e.code = code
      e.status = res.status
      throw e
    }
    return body
  }

  async ping(): Promise<{ ok: boolean }> {
    return this.req('/v1/ping')
  }

  async status(): Promise<any> {
    return this.req(this.pactPath('/status'))
  }

  async peers(): Promise<any[]> {
    return this.req(this.pactPath('/peers'))
  }

  async list(type: string, opts: { limit?: number } = {}): Promise<any[]> {
    const path =
      type === 'knowledge'
        ? 'knowledge'
        : type === 'task'
          ? 'tasks'
          : type === 'skill'
            ? 'skills'
            : type === 'message'
              ? 'messages'
              : type
    const params = new URLSearchParams()
    if (opts.limit) params.set('limit', String(opts.limit))
    const qs = params.toString()
    const res = await this.req(this.pactPath(`/${path}${qs ? `?${qs}` : ''}`))
    return res.entries ?? []
  }

  async addWriter(key: string, indexer = false): Promise<any> {
    return this.req(this.pactPath('/admin/writers'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key, indexer }),
    })
  }

  async removeWriter(key: string): Promise<any> {
    return this.req(this.pactPath(`/admin/writers/${key}`), { method: 'DELETE' })
  }
}
