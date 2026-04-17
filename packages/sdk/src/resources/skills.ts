import { buildQuery, type OpenPactClient } from '../client'
import type { ListOpts, ListPage, SkillEntry, SkillFormat, SkillPayload } from '../types'
import { paginate } from './paginate'

/**
 * Domain label baked into every skill checksum. The daemon enforces
 * the same prefix in `packages/daemon/src/skills.ts` — keep these two
 * in lock-step. Bumping `:vN` invalidates older digests on purpose.
 */
export const SKILL_CHECKSUM_LABEL = 'openpact-skill-content:v1\n'

function utf8Bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

function hexOf(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf)
  let out = ''
  for (let i = 0; i < b.length; i++) out += b[i].toString(16).padStart(2, '0')
  return out
}

/**
 * Compute the canonical, domain-separated checksum the daemon expects
 * on `POST /v1/pacts/:pactId/skills`. Async because we use the Web
 * Crypto SubtleCrypto API, which is available in modern Node (>=18)
 * and every browser the SDK supports.
 *
 * Returns `sha256:<hex>` so the result drops straight into the
 * `checksum` field of `SkillPayload`.
 */
interface SubtleLike {
  digest(algo: string, data: ArrayBuffer | Uint8Array): Promise<ArrayBuffer>
}

export async function computeSkillChecksum(content: string): Promise<string> {
  const label = utf8Bytes(SKILL_CHECKSUM_LABEL)
  const body = utf8Bytes(content)
  const merged = new Uint8Array(label.length + body.length)
  merged.set(label, 0)
  merged.set(body, label.length)
  const subtle: SubtleLike | undefined = (globalThis as { crypto?: { subtle?: SubtleLike } }).crypto
    ?.subtle
  if (!subtle) {
    throw new Error('SubtleCrypto is unavailable; need Node 18+ or a browser')
  }
  const digest = await subtle.digest('SHA-256', merged)
  return 'sha256:' + hexOf(digest)
}

export interface SkillsListOpts extends ListOpts {
  format?: SkillFormat
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
  const list = (opts: SkillsListOpts = {}): Promise<ListPage<SkillEntry>> =>
    client.req<ListPage<SkillEntry>>(
      client.pactPath(`/skills${buildQuery(opts as Record<string, unknown>)}`),
    )
  return {
    list,
    /** Walk every page; stops when `has_more` is false. */
    iterate(opts: SkillsListOpts = {}): AsyncGenerator<SkillEntry> {
      return paginate<SkillEntry, SkillsListOpts>(list, opts)
    },
    create(payload: SkillPayload): Promise<SkillEntry> {
      return client.json<SkillEntry>(client.pactPath('/skills'), 'POST', payload)
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
