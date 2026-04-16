import type { OpenPactClient } from '../client'

export interface PactSummary {
  alias: string
  pact_id: string
  added_at: string
  data_dir: string
  is_current: boolean
  pact_name: string | null
  pact_purpose: string | null
  display_name: string | null
  role: string | null
}

export interface PactListPayload {
  current: string | null
  pacts: PactSummary[]
}

export interface CreatePactBody {
  name: string
  purpose?: string | null
  display_name?: string | null
  alias?: string
}

export interface JoinPactBody {
  key: string
  alias?: string
  display_name?: string | null
  /** Advisory label for the joined pact. Persisted to local config only. */
  pact_name?: string | null
  pact_purpose?: string | null
}

export function pactsResource(client: OpenPactClient) {
  return {
    /** GET /v1/pacts — list every pact on the host, plus the current alias. */
    list(): Promise<PactListPayload> {
      return client.req<PactListPayload>('/v1/pacts')
    },
    /** POST /v1/pacts — seal a new pact on this host. */
    create(body: CreatePactBody): Promise<{
      ok: true
      alias: string
      pact_id: string
      pact_name: string | null
      pact_purpose: string | null
      display_name: string | null
      role: string
    }> {
      return client.json('/v1/pacts', 'POST', { ...body, confirm: true })
    },
    /** POST /v1/pacts/join — enter a pact via its 64-hex key. */
    join(body: JoinPactBody): Promise<{
      ok: true
      alias: string
      pact_id: string
      pact_name: string | null
      pact_purpose: string | null
      role: string
    }> {
      return client.json('/v1/pacts/join', 'POST', { ...body, confirm: true })
    },
    /** POST /v1/pacts/switch — set which pact is "current" on this host. */
    switch(alias: string): Promise<{ ok: true; current: string }> {
      return client.json('/v1/pacts/switch', 'POST', { alias })
    },
    /** PUT /v1/pacts/:pactId/alias — rename a pact's local alias (pact_id unchanged). */
    rename(
      oldAlias: string,
      newAlias: string,
    ): Promise<{ ok: true; alias: string; pact_id: string }> {
      return client.json(`/v1/pacts/${encodeURIComponent(oldAlias)}/alias`, 'PUT', {
        alias: newAlias,
      })
    },
    /** DELETE /v1/pacts/:pactId — leave a pact and delete its data (destructive). */
    remove(alias: string): Promise<{ ok: true; removed: { alias: string; pact_id: string } }> {
      return client.json<{ ok: true; removed: { alias: string; pact_id: string } }>(
        `/v1/pacts/${encodeURIComponent(alias)}`,
        'DELETE',
        { confirm: true },
      )
    },
  }
}
