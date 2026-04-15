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

export interface InstalledSkill {
  id: string
  name: string
  version: string
  format: SkillFormat
  checksum: string
  path: string
  installed_at: string
}

export interface InstallResult {
  ok: true
  id: string
  path: string
  installed_at: string
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
    /**
     * POST /v1/skills/:id/install — install a skill to <dataDir>/skills/.
     * Requires explicit confirmation; the daemon enforces name/version
     * regex + sha256 re-verify before any file write.
     */
    install(id: string): Promise<InstallResult> {
      return client.json<InstallResult>(`/v1/skills/${encodeURIComponent(id)}/install`, 'POST', {
        confirm: true,
      })
    },
    /** GET /v1/skills/installed — list locally installed skills. */
    installed(): Promise<InstalledSkill[]> {
      return client.req<InstalledSkill[]>('/v1/skills/installed')
    },
  }
}
