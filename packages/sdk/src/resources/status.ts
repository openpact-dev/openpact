import type { OpenPactClient } from '../client'
import type { StatusPayload, PeerPayload } from '../types'

export interface HostStatus {
  current: string | null
  peers: number
  pact_count: number
}

export function statusResource(client: OpenPactClient) {
  return {
    /** GET /v1/ping — quick "is the daemon up" check. */
    ping(): Promise<{ ok: boolean }> {
      return client.req<{ ok: boolean }>('/v1/ping')
    },
    /** GET /v1/status — host-level summary (current pact, peer + pact counts). */
    host(): Promise<HostStatus> {
      return client.req<HostStatus>('/v1/status')
    },
    /** GET /v1/pacts/:pactId/status — fat per-pact status payload. */
    get(): Promise<StatusPayload> {
      return client.req<StatusPayload>(client.pactPath('/status'))
    },
    /** GET /v1/pacts/:pactId/peers — connected peers for this pact. */
    peers(): Promise<PeerPayload[]> {
      return client.req<PeerPayload[]>(client.pactPath('/peers'))
    },
  }
}
