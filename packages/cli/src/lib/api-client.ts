export interface ApiClientOpts {
  port?: number
  host?: string
}

export class DaemonNotRunningError extends Error {
  constructor(public url: string) {
    super(`could not reach openpact daemon at ${url}`)
    this.name = 'DaemonNotRunningError'
  }
}

export class ApiClient {
  base: string

  constructor({ port = 7331, host = '127.0.0.1' }: ApiClientOpts = {}) {
    this.base = `http://${host}:${port}`
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
    return this.req('/v1/status')
  }

  async peers(): Promise<any[]> {
    return this.req('/v1/peers')
  }

  async list(type: string, opts: { limit?: number } = {}): Promise<any[]> {
    // knowledge stays singular; task/skill/message endpoints are plural.
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
    return this.req(`/v1/${path}${qs ? `?${qs}` : ''}`)
  }
}
