import { baseEntry, PEER_HANDLE_RE } from './common'

export const MESSAGE_PRIORITIES = ['low', 'normal', 'high'] as const
export type MessagePriority = (typeof MESSAGE_PRIORITIES)[number]

const messageSchema = {
  ...baseEntry,
  properties: {
    ...baseEntry.properties,
    type: { const: 'message' },
    payload: {
      type: 'object',
      properties: {
        to: {
          oneOf: [{ const: '*' }, { type: 'string', pattern: PEER_HANDLE_RE }],
        },
        content: { type: 'string', minLength: 1 },
        priority: { enum: MESSAGE_PRIORITIES as unknown as string[] },
      },
      required: ['to', 'content'],
      additionalProperties: true,
    },
  },
}

export default messageSchema
