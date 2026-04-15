import { baseEntry } from './common'

/*
 * `invite-redeemed` is the log entry an indexer writes when a peer
 * successfully redeems a one-time invite token. It carries the nonce
 * (so apply() can mark it spent in the view) and the joiner's writer
 * pubkey (which is the same pubkey an immediately-following
 * `admin.addWriter` entry will promote). The pair is always appended
 * together in one Autobase flush so they confirm on the same frontier.
 *
 * Nonce format: 48 hex chars = 24 raw bytes of randomness. That's
 * plenty to prevent collisions across the lifetime of a pact.
 */

export const NONCE_RE = '^[0-9a-f]{48}$'

const inviteRedeemedSchema = {
  ...baseEntry,
  properties: {
    ...baseEntry.properties,
    type: { const: 'invite-redeemed' },
    payload: {
      type: 'object',
      properties: {
        nonce: { type: 'string', pattern: NONCE_RE },
        redeemed_by: { type: 'string', pattern: '^[0-9a-f]{64}$' },
      },
      required: ['nonce', 'redeemed_by'],
      additionalProperties: false,
    },
  },
}

export default inviteRedeemedSchema
