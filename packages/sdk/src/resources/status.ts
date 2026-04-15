import type { OpenPactClient } from '../client'
import type { StatusPayload, PeerPayload } from '../types'

export function statusResource(client: OpenPactClient) {
  return {
    /** GET /v1/ping — quick "is the daemon up" check. */
    ping(): Promise<{ ok: boolean }> {
      return client.req<{ ok: boolean }>('/v1/ping')
    },
    /** GET /v1/status — pact id, peer count, entry count, role flags. */
    get(): Promise<StatusPayload> {
      return client.req<StatusPayload>('/v1/status')
    },
    /** GET /v1/peers — currently connected peers. */
    peers(): Promise<PeerPayload[]> {
      return client.req<PeerPayload[]>('/v1/peers')
    },
  }
}
