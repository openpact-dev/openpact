export const PEER_HANDLE_RE = '^anon-[a-z]+-[0-9a-f]{4}$'

export const ENTRY_TYPES = ['knowledge', 'task', 'skill', 'message', 'admin'] as const
export type EntryType = (typeof ENTRY_TYPES)[number]

export interface BaseEntry<T extends EntryType = EntryType, P = unknown> {
  type: T
  timestamp: string
  agent_id: string
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
    payload: { type: 'object' },
    refs: { type: 'array', items: { type: 'string' } },
    ttl: { type: ['integer', 'null'] },
  },
  required: ['type', 'timestamp', 'agent_id', 'payload'],
  additionalProperties: false,
} as const
