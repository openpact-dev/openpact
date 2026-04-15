import type { OpenPactClient } from '../client'

export interface InviteSummary {
  nonce: string
  expires_at: string
  created_at: string
  pact_name: string | null
  issuer_display: string | null
  revoked: boolean
  spent_at: string | null
  spent_by: string | null
  /** true when revoked, spent, or expired — i.e. not redeemable. */
  dead: boolean
}

export interface MintInviteOpts {
  /** Invite lifetime in milliseconds. Daemon default is 7 days. */
  ttlMs?: number
}

export interface MintInviteResult {
  token: string
  share_url: string
  nonce: string
  expires_at: string
}

export function invitesResource(client: OpenPactClient) {
  return {
    /**
     * POST /v1/pacts/:pactId/invites — mint a fresh one-time token.
     * Creator-only; other roles get 409 NOT_CREATOR.
     */
    create(opts: MintInviteOpts = {}): Promise<MintInviteResult> {
      return client.json<MintInviteResult>(client.pactPath('/invites'), 'POST', {
        confirm: true,
        ...(opts.ttlMs !== undefined ? { ttl_ms: opts.ttlMs } : {}),
      })
    },

    /**
     * GET /v1/pacts/:pactId/invites — every invite the creator has
     * minted for this pact, live and dead.
     */
    async list(): Promise<InviteSummary[]> {
      const res = await client.req<{ entries: InviteSummary[] }>(client.pactPath('/invites'))
      return res.entries
    },

    /**
     * DELETE /v1/pacts/:pactId/invites/:nonce — mark an unspent invite
     * revoked. Idempotent. Creator-only.
     */
    revoke(nonce: string): Promise<{ ok: true; nonce: string }> {
      return client.json<{ ok: true; nonce: string }>(
        client.pactPath(`/invites/${encodeURIComponent(nonce)}`),
        'DELETE',
        { confirm: nonce },
      )
    },

    /**
     * POST /v1/pacts/:pactId/invites/redeem — consume a token for the
     * given writer_key. If this daemon isn't an indexer for the pact,
     * the request is forwarded to a peer indexer over the
     * `openpact/invites/v1` protomux channel; the response is
     * translated back to HTTP transparently.
     */
    redeem(token: string, writerKey: string): Promise<{ ok: true; nonce: string }> {
      return client.json<{ ok: true; nonce: string }>(
        client.pactPath('/invites/redeem'),
        'POST',
        { token, writer_key: writerKey, confirm: true },
      )
    },
  }
}
