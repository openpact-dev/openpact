/**
 * Canonical list of error envelopes the daemon emits.
 *
 * Shared between the daemon (which throws `new HttpError(status, CODE, msg)`
 * via these constants) and the SDK (whose {@link ./errors.mapHttpError}
 * switches on them). Keeping the two in one file is how we ensure a new
 * error added on the server surfaces as a typed SDK error in the same
 * release — no more "updated the daemon, forgot the mapper" bugs.
 *
 * The values double as the wire code a caller sees in the
 * `{ error, message, status }` envelope. They are stable public API —
 * changing a value is a breaking change, deleting one is too.
 */
export const ERROR_CODES = {
  /** Envelope shape was malformed (missing body, unknown fields, bad type). */
  BAD_REQUEST: 'BAD_REQUEST',
  /** Pagination cursor did not decode or points past the current head. */
  BAD_CURSOR: 'BAD_CURSOR',
  /** Route was valid but the addressed resource does not exist. */
  NOT_FOUND: 'NOT_FOUND',

  /** Missing/wrong bearer token. */
  UNAUTHORIZED: 'UNAUTHORIZED',
  /** Host header didn't match the daemon's bind address (rebinding attack guard). */
  FORBIDDEN_HOST: 'FORBIDDEN_HOST',
  /** Origin header came from an unexpected scheme/host (browser caller). */
  FORBIDDEN_ORIGIN: 'FORBIDDEN_ORIGIN',

  /** Pre-append validator rejected the entry before the local core grew. */
  BAD_ENTRY: 'BAD_ENTRY',
  /** Request body (or payload) exceeded the daemon's size limit. */
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',

  TASK_NOT_OPEN: 'TASK_NOT_OPEN',
  TASK_ALREADY_CLAIMED: 'TASK_ALREADY_CLAIMED',
  TASK_ALREADY_COMPLETE: 'TASK_ALREADY_COMPLETE',
  NOT_CLAIMER: 'NOT_CLAIMER',
  NOT_CLAIMED: 'NOT_CLAIMED',
  NOT_A_MEMBER: 'NOT_A_MEMBER',
  NOT_INDEXER: 'NOT_INDEXER',
  NOT_CREATOR: 'NOT_CREATOR',

  /** Sent skill bytes did not hash to the declared checksum. */
  SKILL_CHECKSUM_MISMATCH: 'SKILL_CHECKSUM_MISMATCH',
  BAD_SKILL_NAME: 'BAD_SKILL_NAME',

  /** Route requires explicit `{ confirm: true }` but the caller didn't send it. */
  NOT_CONFIRMED: 'NOT_CONFIRMED',

  /** Pact-level / task-level identity failure during an admin operation. */
  UNKNOWN_PACT: 'UNKNOWN_PACT',
  PACT_NOT_READY: 'PACT_NOT_READY',

  // Invite redemption — see packages/daemon/src/invites.ts.
  INVITE_BAD_SHAPE: 'INVITE_BAD_SHAPE',
  INVITE_WRONG_PACT: 'INVITE_WRONG_PACT',
  UNKNOWN_INVITE: 'UNKNOWN_INVITE',
  INVITE_REVOKED: 'INVITE_REVOKED',
  INVITE_SPENT: 'INVITE_SPENT',
  INVITE_NOT_INDEXER: 'INVITE_NOT_INDEXER',
  INVITE_EXPIRED: 'INVITE_EXPIRED',

  /** Fan-out redeem could not find a live, indexer-capable agent. */
  NO_AGENTS: 'NO_AGENTS',
  NO_INDEXER_REACHABLE: 'NO_INDEXER_REACHABLE',
  AGENT_DISCONNECTED: 'AGENT_DISCONNECTED',

  /** Autobase view didn't catch up within waitForView's window. */
  VIEW_TIMEOUT: 'VIEW_TIMEOUT',

  /** @fastify/rate-limit tripped for this IP. */
  RATE_LIMITED: 'RATE_LIMITED',

  /** Catch-all for unexpected daemon faults. */
  INTERNAL: 'INTERNAL',
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]
