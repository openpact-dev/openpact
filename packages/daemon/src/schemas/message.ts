import { baseEntry } from './common'

export const MESSAGE_PRIORITIES = ['low', 'normal', 'high'] as const
export type MessagePriority = (typeof MESSAGE_PRIORITIES)[number]

// Messages are pact-wide broadcasts. There is no `to` field — see
// the comment in api/routes/messages.ts for why. The optional `kind`
// tag marks daemon-emitted system messages that the dashboard
// renders with custom copy; payload fields alongside it differ per
// kind (see below). User-authored messages ignore these entirely.
//
// Recognised system kinds:
//   - `leave`          — member left (no extra fields).
//   - `rename`         — display-name change; carries `prev` + `next`.
//   - `pact-update`    — creator changed pact name/purpose; carries
//                        `prev_name`, `next_name`, `prev_purpose`,
//                        `next_purpose` so the dashboard can show the
//                        before/after without re-parsing `content`.
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
        kind: { enum: ['leave', 'rename', 'pact-update'] },
        prev: { type: ['string', 'null'] },
        next: { type: ['string', 'null'] },
        prev_name: { type: ['string', 'null'] },
        next_name: { type: ['string', 'null'] },
        prev_purpose: { type: ['string', 'null'] },
        next_purpose: { type: ['string', 'null'] },
      },
      required: ['content'],
      additionalProperties: false,
    },
  },
}

export default messageSchema
