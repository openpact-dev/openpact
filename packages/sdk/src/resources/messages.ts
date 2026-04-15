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
    /** GET /v1/messages — list messages, optionally filtered by since-cursor or recipient. */
    list(opts: MessagesListOpts = {}): Promise<MessageEntry[]> {
      return client.req<MessageEntry[]>(
        `/v1/messages${buildQuery(opts as Record<string, unknown>)}`,
      )
    },
    /** POST /v1/messages — send a message to '*' (broadcast) or a specific peer handle. */
    send(payload: MessagePayload): Promise<AppendResult> {
      return client.json<AppendResult>('/v1/messages', 'POST', payload)
    },
  }
}
