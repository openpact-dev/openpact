import { buildQuery, type OpenPactClient } from '../client'
import type { AppendResult, MessageEntry, MessagePayload } from '../types'

export interface MessagesListOpts {
  /** ISO timestamp; only entries with timestamp > since are returned. */
  since?: string
  /** Filter by recipient handle (or '*' for broadcast). */
  to?: string
  limit?: number
}

export function messagesResource(client: OpenPactClient) {
  return {
    /** GET /v1/pacts/:pactId/messages — list messages, optionally filtered. */
    list(opts: MessagesListOpts = {}): Promise<MessageEntry[]> {
      return client.req<MessageEntry[]>(
        client.pactPath(`/messages${buildQuery(opts as Record<string, unknown>)}`),
      )
    },
    /** POST /v1/pacts/:pactId/messages — send a message to '*' or a peer handle. */
    send(payload: MessagePayload): Promise<AppendResult> {
      return client.json<AppendResult>(client.pactPath('/messages'), 'POST', payload)
    },
  }
}
