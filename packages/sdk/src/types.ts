// Shared types mirroring the daemon's REST contract. Kept narrow on purpose:
// only the fields the daemon actually returns are typed. New optional fields
// land here as the daemon evolves.

export type EntryType = 'knowledge' | 'task' | 'skill' | 'message'

export interface BaseEntry<T extends EntryType = EntryType, P = unknown> {
  id: string
  type: T
  timestamp: string
  /** Deterministic peer handle derived from the author's public key. Canonical identity. */
  agent_id: string
  /**
   * Advisory display name the author picked at init/join time. Null
   * means the author hasn't set one; UIs should fall back to agent_id.
   * Set and preserved by the daemon — never trust this field for
   * authorization.
   */
  display_name?: string | null
  payload: P
  refs?: string[]
  ttl?: number | null
}

export interface KnowledgePayload {
  topic: string
  content: string
  confidence?: number
  source?: string
  [key: string]: unknown
}

export type KnowledgeEntry = BaseEntry<'knowledge', KnowledgePayload>

export interface MessagePayload {
  to: string
  content: string
  priority?: 'low' | 'normal' | 'high'
  [key: string]: unknown
}

export type MessageEntry = BaseEntry<'message', MessagePayload>

export type SkillFormat = 'openclaw' | 'langchain' | 'generic'

export interface SkillPayload {
  name: string
  version: string
  description?: string
  format: SkillFormat
  content: string
  checksum: string
  requires_approval?: boolean
  [key: string]: unknown
}

export type SkillEntry = BaseEntry<'skill', SkillPayload>

export type TaskStatus = 'open' | 'claimed' | 'complete'

export interface TaskPayload {
  title: string
  description?: string
  status: TaskStatus
  claimed_by?: string | null
  result?: string | null
  [key: string]: unknown
}

export type TaskEntry = BaseEntry<'task', TaskPayload>

export interface TaskState {
  id: string
  title: string
  description?: string
  status: TaskStatus
  claimed_by: string | null
  /** ISO timestamp of the entry that established the current `claimed` status (if any). */
  claimed_at: string | null
  /**
   * Set when the daemon's wall-clock observes that a `claimed` task
   * has timed out. When set, `status` is reported as `open` and
   * `claimed_by` as null, but `history` retains the original claim.
   * Anyone may claim again.
   */
  expired_at: string | null
  result: string | null
  history: TaskEntry[]
}

export interface StatusPayload {
  pact_id: string | null
  /** Human-readable pact name chosen by the creator. Null if unset. */
  pact_name: string | null
  /** One-line purpose statement for this pact. Null if unset. */
  pact_purpose: string | null
  peer_handle: string | null
  /** This peer's chosen display name. Null falls back to peer_handle. */
  display_name: string | null
  role: string | null
  public_key: string | null
  peers: number
  entries: number
  is_writer: boolean
  is_indexer: boolean
  synced: boolean
}

export interface PeerPayload {
  id: string
  remote_key: string
  online: boolean
}

export interface AppendResult {
  id: string
  timestamp: string
}

/**
 * Options common to every paginated list call. Per-resource opts types
 * extend this with their own filters.
 */
export interface ListOpts {
  /** Sort direction. `'desc'` (default) = newest first. */
  order?: 'asc' | 'desc'
  /** Max entries in this page. 1-1000; default 50. */
  limit?: number
  /** Opaque cursor from the previous page, or null for the first page. */
  cursor?: string | null
}

/**
 * Envelope every paginated list endpoint returns. `cursor` is opaque —
 * pass it back into the next call to `.list()` to fetch the next page.
 * When `has_more` is false the walk is complete.
 */
export interface ListPage<T> {
  entries: T[]
  cursor: string | null
  has_more: boolean
}
