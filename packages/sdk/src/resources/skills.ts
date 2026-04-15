import { buildQuery, type OpenPactClient } from '../client'
import type { AppendResult, SkillEntry, SkillFormat, SkillPayload } from '../types'

export interface SkillsListOpts {
  format?: SkillFormat
  limit?: number
}

export interface SkillContent {
  id: string
  name: string
  version: string
  format: SkillFormat
  checksum: string
  content: string
}

export function skillsResource(client: OpenPactClient) {
  return {
    /** GET /v1/skills — list skills, optionally filtered by runtime format. */
    list(opts: SkillsListOpts = {}): Promise<SkillEntry[]> {
      return client.req<SkillEntry[]>(`/v1/skills${buildQuery(opts as Record<string, unknown>)}`)
    },
    /** POST /v1/skills — share a skill. Caller must compute the sha256 checksum. */
    create(payload: SkillPayload): Promise<AppendResult> {
      return client.json<AppendResult>('/v1/skills', 'POST', payload)
    },
    /** GET /v1/skills/:id/content — download a skill's full content for installation. */
    getContent(id: string): Promise<SkillContent> {
      return client.req<SkillContent>(`/v1/skills/${encodeURIComponent(id)}/content`)
    },
  }
}
