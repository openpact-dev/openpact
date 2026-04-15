import { buildQuery, type OpenPactClient } from '../client'
import type { AppendResult, KnowledgeEntry, KnowledgePayload, ListOpts, ListPage } from '../types'
import { paginate } from './paginate'

export interface KnowledgeListOpts extends ListOpts {
  topic?: string
}

export function knowledgeResource(client: OpenPactClient) {
  const list = (opts: KnowledgeListOpts = {}): Promise<ListPage<KnowledgeEntry>> =>
    client.req<ListPage<KnowledgeEntry>>(
      client.pactPath(`/knowledge${buildQuery(opts as Record<string, unknown>)}`),
    )

  return {
    /** GET /v1/pacts/:pactId/knowledge — list knowledge, paginated. */
    list,
    /**
     * Walk every page of results as an async iterator. Stops when
     * `has_more` becomes false. Use when the caller wants "everything
     * matching these filters" and doesn't want to manage cursors.
     */
    iterate(opts: KnowledgeListOpts = {}): AsyncGenerator<KnowledgeEntry> {
      return paginate<KnowledgeEntry, KnowledgeListOpts>(list, opts)
    },
    /** POST /v1/pacts/:pactId/knowledge — share a discovery with the pact. */
    create(payload: KnowledgePayload): Promise<AppendResult> {
      return client.json<AppendResult>(client.pactPath('/knowledge'), 'POST', payload)
    },
  }
}
