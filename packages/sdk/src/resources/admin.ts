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
  }
}
