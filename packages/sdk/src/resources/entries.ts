import type { OpenPactClient } from '../client'

export interface EntryRecord {
  id: string
  type: 'knowledge' | 'task' | 'skill' | 'message'
  timestamp: string
  agent_id: string
  display_name?: string | null
  refs?: string[]
  payload: Record<string, unknown>
}

export function entriesResource(client: OpenPactClient) {
  return {
    /** GET /v1/pacts/:pactId/entries/:id — full entry across any type. */
    get(id: string): Promise<EntryRecord> {
      return client.req<EntryRecord>(client.pactPath(`/entries/${encodeURIComponent(id)}`))
    },
    /** GET /v1/pacts/:pactId/entries/:id/referenced-by — entries that reference this one. */
    referencedBy(id: string): Promise<EntryRecord[]> {
      return client.req<EntryRecord[]>(
        client.pactPath(`/entries/${encodeURIComponent(id)}/referenced-by`),
      )
    },
  }
}
