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
    list(opts: SkillsListOpts = {}): Promise<SkillEntry[]> {
      return client.req<SkillEntry[]>(
        client.pactPath(`/skills${buildQuery(opts as Record<string, unknown>)}`),
      )
    },
    create(payload: SkillPayload): Promise<AppendResult> {
      return client.json<AppendResult>(client.pactPath('/skills'), 'POST', payload)
    },
    getContent(id: string): Promise<SkillContent> {
      return client.req<SkillContent>(client.pactPath(`/skills/${encodeURIComponent(id)}/content`))
    },
    install(id: string): Promise<InstallResult> {
      return client.json<InstallResult>(
        client.pactPath(`/skills/${encodeURIComponent(id)}/install`),
        'POST',
        { confirm: true },
      )
    },
    installed(): Promise<InstalledSkill[]> {
      return client.req<InstalledSkill[]>(client.pactPath('/skills/installed'))
    },
  }
}
