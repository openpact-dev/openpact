import { baseEntry } from './common'

export const MESSAGE_PRIORITIES = ['low', 'normal', 'high'] as const
export type MessagePriority = (typeof MESSAGE_PRIORITIES)[number]

// Messages are pact-wide broadcasts. There is no `to` field — see
// the comment in api/routes/messages.ts for why. The optional `kind`
// + `prev` + `next` triple is reserved for daemon-emitted system
// messages (member left, display-name rename) that the dashboard
// renders with custom copy. User-authored messages should ignore them.
const messageSchema = {
  ...baseEntry,
  properties: {
    ...baseEntry.properties,
    type: { const: 'message' },
    payload: {
      type: 'object',
      properties: {
        content: { type: 'string', minLength: 1 },
        priority: { enum: MESSAGE_PRIORITIES as unknown as string[] },
        kind: { enum: ['leave', 'rename'] },
        prev: { type: ['string', 'null'] },
        next: { type: ['string', 'null'] },
      },
      required: ['content'],
      additionalProperties: false,
    },
  },
}

export default messageSchema
