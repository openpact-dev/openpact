import { buildQuery, type OpenPactClient } from '../client'
import type { AppendResult, KnowledgeEntry, KnowledgePayload } from '../types'

export interface KnowledgeListOpts {
  topic?: string
  limit?: number
}

export function knowledgeResource(client: OpenPactClient) {
  return {
    /** GET /v1/knowledge — list knowledge entries, optionally filtered by topic. */
    list(opts: KnowledgeListOpts = {}): Promise<KnowledgeEntry[]> {
      return client.req<KnowledgeEntry[]>(
        `/v1/knowledge${buildQuery(opts as Record<string, unknown>)}`,
      )
    },
    /** POST /v1/knowledge — share a discovery with the pact. */
    create(payload: KnowledgePayload): Promise<AppendResult> {
      return client.json<AppendResult>('/v1/knowledge', 'POST', payload)
    },
  }
}
