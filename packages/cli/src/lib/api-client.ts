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

  async addMember(key: string, indexer = false): Promise<any> {
    return this.req(this.pactPath('/admin/members'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key, indexer }),
    })
  }

  async removeMember(key: string): Promise<any> {
    return this.req(this.pactPath(`/admin/members/${key}`), { method: 'DELETE' })
  }

  async createInvite(opts: { ttl_ms?: number } = {}): Promise<{
    token: string
    share_url: string
    nonce: string
    expires_at: string
  }> {
    return this.req(this.pactPath('/invites'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: true, ...opts }),
    })
  }

  async listInvites(): Promise<{
    entries: Array<{
      nonce: string
      expires_at: string
      created_at: string
      pact_name: string | null
      issuer_display: string | null
      revoked: boolean
      spent_at: string | null
      spent_by: string | null
      dead: boolean
    }>
  }> {
    return this.req(this.pactPath('/invites'))
  }

  async revokeInvite(nonce: string): Promise<any> {
    return this.req(this.pactPath(`/invites/${nonce}`), {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: nonce }),
    })
  }

  async redeemInvite(token: string, memberKey: string): Promise<{ ok: true; nonce: string }> {
    return this.req(this.pactPath('/invites/redeem'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, writer_key: memberKey, confirm: true }),
    })
  }

  async joinPact(
    key: string,
    opts: {
      alias?: string
      display_name?: string | null
      pact_name?: string | null
      pact_purpose?: string | null
    } = {},
  ): Promise<{
    ok: true
    alias: string
    pact_id: string
    role: string
  }> {
    return this.req('/v1/pacts/join', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key, confirm: true, ...opts }),
    })
  }

  async listPacts(): Promise<{
    current: string | null
    pacts: Array<{
      alias: string
      pact_id: string
      is_current: boolean
      pact_name: string | null
      pact_purpose: string | null
      display_name: string | null
      role: string | null
    }>
  }> {
    return this.req('/v1/pacts')
  }

  async createPact(opts: {
    name: string
    purpose?: string | null
    display_name?: string | null
    alias?: string
  }): Promise<{
    ok: true
    alias: string
    pact_id: string
    pact_name: string | null
    pact_purpose: string | null
    display_name: string | null
    peer_handle: string | null
    role: string
  }> {
    return this.req('/v1/pacts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: true, ...opts }),
    })
  }

  async deletePact(aliasOrId: string): Promise<{ ok: true }> {
    return this.req(`/v1/pacts/${encodeURIComponent(aliasOrId)}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: true }),
    })
  }
}
