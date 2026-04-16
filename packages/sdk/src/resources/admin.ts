import type { OpenPactClient } from '../client'

export interface AddMemberOpts {
  indexer?: boolean
}

export function adminResource(client: OpenPactClient) {
  return {
    /** POST /v1/pacts/:pactId/admin/members — bind a peer as member or indexer. */
    addMember(
      key: string,
      opts: AddMemberOpts = {},
    ): Promise<{ ok: true; key: string; indexer: boolean }> {
      return client.json<{ ok: true; key: string; indexer: boolean }>(
        client.pactPath('/admin/members'),
        'POST',
        {
          key,
          indexer: !!opts.indexer,
        },
      )
    },
    /** DELETE /v1/pacts/:pactId/admin/members/:key — remove a member. */
    removeMember(key: string): Promise<{ ok: true; key: string }> {
      return client.json<{ ok: true; key: string }>(
        client.pactPath(`/admin/members/${encodeURIComponent(key)}`),
        'DELETE',
      )
    },
    /** POST /v1/pacts/:pactId/admin/promote — addMember(indexer=true) creator-only wrapper. */
    promoteToIndexer(key: string): Promise<{ ok: true; key: string; indexer: true }> {
      return client.json<{ ok: true; key: string; indexer: true }>(
        client.pactPath('/admin/promote'),
        'POST',
        {
          key,
          confirm: true,
        },
      )
    },
    /** POST /v1/pacts/:pactId/admin/remove — creator-only member removal wrapper. */
    removeMemberAsCreator(key: string): Promise<{ ok: true; key: string }> {
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
