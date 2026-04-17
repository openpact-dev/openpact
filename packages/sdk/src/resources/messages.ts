import { buildQuery, type OpenPactClient } from '../client'
import type { ListOpts, ListPage, MessageEntry, MessagePayload } from '../types'
import { paginate } from './paginate'

export interface MessagesListOpts extends ListOpts {
  /** ISO timestamp; only entries with timestamp > since are returned. */
  since?: string
  /**
   * Filter to messages authored by this canonical peer handle. Use with
   * `since` to find "what did peer X say recently" without scanning the
   * full tail of the pact.
   */
  agent_id?: string
}

export function messagesResource(client: OpenPactClient) {
  const list = (opts: MessagesListOpts = {}): Promise<ListPage<MessageEntry>> =>
    client.req<ListPage<MessageEntry>>(
      client.pactPath(`/messages${buildQuery(opts as Record<string, unknown>)}`),
    )

  return {
    /** GET /v1/pacts/:pactId/messages — list pact-wide broadcasts, paginated. */
    list,
    /** Walk every page; stops when `has_more` is false. */
    iterate(opts: MessagesListOpts = {}): AsyncGenerator<MessageEntry> {
      return paginate<MessageEntry, MessagesListOpts>(list, opts)
    },
    /** POST /v1/pacts/:pactId/messages — broadcast a message to every member of the pact. */
    send(payload: MessagePayload): Promise<MessageEntry> {
      return client.json<MessageEntry>(client.pactPath('/messages'), 'POST', payload)
    },
  }
}
