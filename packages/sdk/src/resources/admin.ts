import type { OpenPactClient } from '../client'

export interface AddWriterOpts {
  indexer?: boolean
}

export function adminResource(client: OpenPactClient) {
  return {
    /** POST /v1/admin/writers — bind a peer (by 64-hex public key) as writer or indexer. */
    addWriter(
      key: string,
      opts: AddWriterOpts = {},
    ): Promise<{ ok: true; key: string; indexer: boolean }> {
      return client.json<{ ok: true; key: string; indexer: boolean }>('/v1/admin/writers', 'POST', {
        key,
        indexer: !!opts.indexer,
      })
    },
    /** DELETE /v1/admin/writers/:key — remove a writer from the pact. */
    removeWriter(key: string): Promise<{ ok: true; key: string }> {
      return client.json<{ ok: true; key: string }>(
        `/v1/admin/writers/${encodeURIComponent(key)}`,
        'DELETE',
      )
    },
    /**
     * POST /v1/admin/promote — addWriter(indexer=true) wrapper, requires
     * `daemon.role === 'creator'` and explicit confirmation. Used by
     * the dashboard's Network screen.
     */
    promote(key: string): Promise<{ ok: true; key: string; indexer: true }> {
      return client.json<{ ok: true; key: string; indexer: true }>('/v1/admin/promote', 'POST', {
        key,
        confirm: true,
      })
    },
    /**
     * POST /v1/admin/remove — removeWriter wrapper, same gating as
     * promote. Used by the dashboard's Network screen.
     */
    remove(key: string): Promise<{ ok: true; key: string }> {
      return client.json<{ ok: true; key: string }>('/v1/admin/remove', 'POST', {
        key,
        confirm: true,
      })
    },
    /**
     * PUT /v1/pact — update this pact's name and/or purpose. Creator
     * only. Omitting a field leaves it unchanged; passing null clears.
     */
    setPactInfo(opts: {
      name?: string | null
      purpose?: string | null
    }): Promise<{ ok: true; pact_name: string | null; pact_purpose: string | null }> {
      return client.json('/v1/pact', 'PUT', opts)
    },
    /**
     * PUT /v1/me — update this peer's display name. Any peer may edit
     * their own. Null or empty clears back to the deterministic handle.
     */
    setDisplayName(name: string | null): Promise<{ ok: true; display_name: string | null }> {
      return client.json('/v1/me', 'PUT', { display_name: name })
    },
  }
}
