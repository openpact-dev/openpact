import type { OpenPactClient } from '../client'

export interface AddWriterOpts {
  indexer?: boolean
}

export function adminResource(client: OpenPactClient) {
  return {
    /** POST /v1/pacts/:pactId/admin/writers — bind a peer as writer or indexer. */
    addWriter(
      key: string,
      opts: AddWriterOpts = {},
    ): Promise<{ ok: true; key: string; indexer: boolean }> {
      return client.json<{ ok: true; key: string; indexer: boolean }>(
        client.pactPath('/admin/writers'),
        'POST',
        {
          key,
          indexer: !!opts.indexer,
        },
      )
    },
    /** DELETE /v1/pacts/:pactId/admin/writers/:key — remove a writer. */
    removeWriter(key: string): Promise<{ ok: true; key: string }> {
      return client.json<{ ok: true; key: string }>(
        client.pactPath(`/admin/writers/${encodeURIComponent(key)}`),
        'DELETE',
      )
    },
    /** POST /v1/pacts/:pactId/admin/promote — addWriter(indexer=true) creator-only wrapper. */
    promote(key: string): Promise<{ ok: true; key: string; indexer: true }> {
      return client.json<{ ok: true; key: string; indexer: true }>(
        client.pactPath('/admin/promote'),
        'POST',
        {
          key,
          confirm: true,
        },
      )
    },
    /** POST /v1/pacts/:pactId/admin/remove — removeWriter creator-only wrapper. */
    remove(key: string): Promise<{ ok: true; key: string }> {
      return client.json<{ ok: true; key: string }>(client.pactPath('/admin/remove'), 'POST', {
        key,
        confirm: true,
      })
    },
    /**
     * PUT /v1/pacts/:pactId/info — update this pact's name + purpose.
     * Creator-only. Null clears a field; omit to leave it unchanged.
     */
    setPactInfo(opts: {
      name?: string | null
      purpose?: string | null
    }): Promise<{ ok: true; pact_name: string | null; pact_purpose: string | null }> {
      return client.json(client.pactPath('/info'), 'PUT', opts)
    },
    /**
     * PUT /v1/pacts/:pactId/me — update this peer's display name on this pact.
     * Any peer may edit their own. Null/empty clears back to the peer handle.
     */
    setDisplayName(name: string | null): Promise<{ ok: true; display_name: string | null }> {
      return client.json(client.pactPath('/me'), 'PUT', { display_name: name })
    },
  }
}
