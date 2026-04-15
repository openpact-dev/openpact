import { buildQuery, type OpenPactClient } from '../client'
import type { AppendResult, ListOpts, ListPage, MessageEntry, MessagePayload } from '../types'
import { paginate } from './paginate'

export interface MessagesListOpts extends ListOpts {
  /** ISO timestamp; only entries with timestamp > since are returned. */
  since?: string
  /** Filter by recipient handle (or '*' for broadcast). */
  to?: string
}

export function messagesResource(client: OpenPactClient) {
  const list = (opts: MessagesListOpts = {}): Promise<ListPage<MessageEntry>> =>
    client.req<ListPage<MessageEntry>>(
      client.pactPath(`/messages${buildQuery(opts as Record<string, unknown>)}`),
    )

  return {
    /** GET /v1/pacts/:pactId/messages — list messages, paginated. */
    list,
    /** Walk every page; stops when `has_more` is false. */
    iterate(opts: MessagesListOpts = {}): AsyncGenerator<MessageEntry> {
      return paginate<MessageEntry, MessagesListOpts>(list, opts)
    },
    /** POST /v1/pacts/:pactId/messages — send a message to '*' or a peer handle. */
    send(payload: MessagePayload): Promise<AppendResult> {
      return client.json<AppendResult>(client.pactPath('/messages'), 'POST', payload)
    },
  }
}
