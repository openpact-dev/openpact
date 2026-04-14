const PEER_HANDLE_RE = '^anon-[a-z]+-[0-9a-f]{4}$'

const ENTRY_TYPES = ['knowledge', 'task', 'skill', 'message', 'admin']

const baseEntry = {
  type: 'object',
  properties: {
    type: { enum: ENTRY_TYPES },
    timestamp: { type: 'string', format: 'date-time' },
    agent_id: { type: 'string', pattern: PEER_HANDLE_RE },
    payload: { type: 'object' },
    refs: { type: 'array', items: { type: 'string' } },
    ttl: { type: ['integer', 'null'] },
  },
  required: ['type', 'timestamp', 'agent_id', 'payload'],
  additionalProperties: false,
}

module.exports = { baseEntry, ENTRY_TYPES, PEER_HANDLE_RE }
