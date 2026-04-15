export const PEER_HANDLE_RE = '^anon-[a-z]+-[0-9a-f]{4}$'

export const ENTRY_TYPES = [
  'knowledge',
  'task',
  'skill',
  'message',
  'admin',
  'invite-redeemed',
] as const
export type EntryType = (typeof ENTRY_TYPES)[number]

// Display names are advisory — the canonical, verified identity of an
// author stays `agent_id` (the deterministic peer handle). The field
// exists only to render friendlier names in UIs. Keep it short so it
// doesn't bloat the log; accept unicode (names aren't ASCII-only).
export const DISPLAY_NAME_MAX = 64

export interface BaseEntry<T extends EntryType = EntryType, P = unknown> {
  type: T
  timestamp: string
  agent_id: string
  display_name?: string | null
  payload: P
  refs?: string[]
  ttl?: number | null
}

export const baseEntry = {
  type: 'object',
  properties: {
    type: { enum: ENTRY_TYPES as unknown as string[] },
    timestamp: { type: 'string', format: 'date-time' },
    agent_id: { type: 'string', pattern: PEER_HANDLE_RE },
    display_name: {
      type: ['string', 'null'],
      maxLength: DISPLAY_NAME_MAX,
    },
    payload: { type: 'object' },
    refs: { type: 'array', items: { type: 'string' } },
    ttl: { type: ['integer', 'null'] },
  },
  required: ['type', 'timestamp', 'agent_id', 'payload'],
  additionalProperties: false,
} as const
