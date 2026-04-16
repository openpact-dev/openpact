// Error class hierarchy. Every server error code maps to a typed subclass
// so callers can `instanceof`-check rather than string-match.

import { ERROR_CODES } from './error-codes'

export class OpenPactError extends Error {
  status?: number
  code?: string

  constructor(message: string, opts: { status?: number; code?: string } = {}) {
    super(message)
    this.name = 'OpenPactError'
    this.status = opts.status
    this.code = opts.code
  }
}

export class DaemonNotRunningError extends OpenPactError {
  baseUrl: string

  constructor(baseUrl: string) {
    super(`could not reach openpact daemon at ${baseUrl}`)
    this.name = 'DaemonNotRunningError'
    this.baseUrl = baseUrl
  }
}

export class BadRequestError extends OpenPactError {
  constructor(message: string) {
    super(message, { status: 400, code: 'BAD_REQUEST' })
    this.name = 'BadRequestError'
  }
}

export class BadCursorError extends OpenPactError {
  constructor(message: string) {
    super(message, { status: 400, code: 'BAD_CURSOR' })
    this.name = 'BadCursorError'
  }
}

export class NotFoundError extends OpenPactError {
  constructor(message: string) {
    super(message, { status: 404, code: 'NOT_FOUND' })
    this.name = 'NotFoundError'
  }
}

export class TaskNotOpenError extends OpenPactError {
  constructor(message: string) {
    super(message, { status: 409, code: 'TASK_NOT_OPEN' })
    this.name = 'TaskNotOpenError'
  }
}

export class TaskAlreadyClaimedError extends OpenPactError {
  constructor(message: string) {
    super(message, { status: 409, code: 'TASK_ALREADY_CLAIMED' })
    this.name = 'TaskAlreadyClaimedError'
  }
}

export class TaskAlreadyCompleteError extends OpenPactError {
  constructor(message: string) {
    super(message, { status: 409, code: 'TASK_ALREADY_COMPLETE' })
    this.name = 'TaskAlreadyCompleteError'
  }
}

export class NotClaimerError extends OpenPactError {
  constructor(message: string) {
    super(message, { status: 409, code: 'NOT_CLAIMER' })
    this.name = 'NotClaimerError'
  }
}

export class NotClaimedError extends OpenPactError {
  constructor(message: string) {
    super(message, { status: 409, code: 'NOT_CLAIMED' })
    this.name = 'NotClaimedError'
  }
}

export class NotAMemberError extends OpenPactError {
  constructor(message: string) {
    super(message, { status: 409, code: 'NOT_A_MEMBER' })
    this.name = 'NotAMemberError'
  }
}

export class SkillChecksumMismatchError extends OpenPactError {
  constructor(message: string, status = 400) {
    super(message, { status, code: 'SKILL_CHECKSUM_MISMATCH' })
    this.name = 'SkillChecksumMismatchError'
  }
}

export class NotIndexerError extends OpenPactError {
  constructor(message: string) {
    super(message, { status: 409, code: 'NOT_INDEXER' })
    this.name = 'NotIndexerError'
  }
}

export class BadSkillNameError extends OpenPactError {
  constructor(message: string) {
    super(message, { status: 400, code: 'BAD_SKILL_NAME' })
    this.name = 'BadSkillNameError'
  }
}

export class NotConfirmedError extends OpenPactError {
  constructor(message: string) {
    super(message, { status: 400, code: 'NOT_CONFIRMED' })
    this.name = 'NotConfirmedError'
  }
}

export class NotCreatorError extends OpenPactError {
  constructor(message: string) {
    super(message, { status: 409, code: 'NOT_CREATOR' })
    this.name = 'NotCreatorError'
  }
}

export class InviteBadShapeError extends OpenPactError {
  constructor(message: string) {
    super(message, { status: 400, code: 'INVITE_BAD_SHAPE' })
    this.name = 'InviteBadShapeError'
  }
}

export class InviteWrongPactError extends OpenPactError {
  constructor(message: string) {
    super(message, { status: 400, code: 'INVITE_WRONG_PACT' })
    this.name = 'InviteWrongPactError'
  }
}

export class UnknownInviteError extends OpenPactError {
  constructor(message: string) {
    super(message, { status: 404, code: 'UNKNOWN_INVITE' })
    this.name = 'UnknownInviteError'
  }
}

export class InviteRevokedError extends OpenPactError {
  constructor(message: string) {
    super(message, { status: 409, code: 'INVITE_REVOKED' })
    this.name = 'InviteRevokedError'
  }
}

export class InviteSpentError extends OpenPactError {
  constructor(message: string) {
    super(message, { status: 409, code: 'INVITE_SPENT' })
    this.name = 'InviteSpentError'
  }
}

export class InviteNotIndexerError extends OpenPactError {
  constructor(message: string) {
    super(message, { status: 409, code: 'INVITE_NOT_INDEXER' })
    this.name = 'InviteNotIndexerError'
  }
}

export class InviteExpiredError extends OpenPactError {
  constructor(message: string) {
    super(message, { status: 410, code: 'INVITE_EXPIRED' })
    this.name = 'InviteExpiredError'
  }
}

export class NoIndexerReachableError extends OpenPactError {
  constructor(message: string, code: 'NO_PEERS' | 'NO_INDEXER_REACHABLE' = 'NO_INDEXER_REACHABLE') {
    super(message, { status: 503, code })
    this.name = 'NoIndexerReachableError'
  }
}

export class DaemonError extends OpenPactError {
  constructor(message: string, status: number, code = 'INTERNAL') {
    super(message, { status, code })
    this.name = 'DaemonError'
  }
}

/**
 * Daemon refused the bearer token (missing, wrong, or the preHandler
 * mapped a Host/Origin mismatch to 403 FORBIDDEN_*). CLI surfaces this
 * as "your token is wrong — check ~/.openpact/daemon.json".
 */
export class UnauthorizedError extends OpenPactError {
  constructor(
    message: string,
    code: 'UNAUTHORIZED' | 'FORBIDDEN_HOST' | 'FORBIDDEN_ORIGIN' = 'UNAUTHORIZED',
  ) {
    super(message, { status: code === 'UNAUTHORIZED' ? 401 : 403, code })
    this.name = 'UnauthorizedError'
  }
}

/**
 * Pre-append validation failure — schema shape wrong, type unknown, or
 * payload > MAX_PAYLOAD_BYTES. Fires before the local Hypercore grows.
 */
export class BadEntryError extends OpenPactError {
  constructor(message: string) {
    super(message, { status: 400, code: 'BAD_ENTRY' })
    this.name = 'BadEntryError'
  }
}

/** Body > bodyLimit, or payload > MAX_PAYLOAD_BYTES. */
export class PayloadTooLargeError extends OpenPactError {
  constructor(message: string) {
    super(message, { status: 413, code: 'PAYLOAD_TOO_LARGE' })
    this.name = 'PayloadTooLargeError'
  }
}

/**
 * Caller-side write succeeded (local Hypercore appended) but the
 * daemon's Autobase view didn't surface the entry within the wait
 * window. Typically recoverable: retry, or re-read the task state
 * after the SSE update tick.
 */
export class ViewTimeoutError extends OpenPactError {
  constructor(message: string) {
    super(message, { status: 504, code: 'VIEW_TIMEOUT' })
    this.name = 'ViewTimeoutError'
  }
}

/**
 * Daemon has applied its per-IP rate limit. Surface to SDK callers
 * so they can back off — the envelope's message includes a
 * `retry in <n>s` hint from the daemon.
 */
export class RateLimitedError extends OpenPactError {
  constructor(message: string) {
    super(message, { status: 429, code: 'RATE_LIMITED' })
    this.name = 'RateLimitedError'
  }
}

/**
 * Map a daemon error envelope to a typed error subclass. Falls back to the
 * generic DaemonError for unknown codes so forward-compat additions don't
 * crash older SDK versions.
 */
export function mapHttpError(status: number, body: unknown): OpenPactError {
  const envelope = (body ?? {}) as { error?: string; message?: string }
  const code = envelope.error ?? 'UNKNOWN'
  const message = envelope.message ?? `HTTP ${status}`
  switch (code) {
    case ERROR_CODES.BAD_REQUEST:
      return new BadRequestError(message)
    case ERROR_CODES.BAD_CURSOR:
      return new BadCursorError(message)
    case ERROR_CODES.NOT_FOUND:
    case ERROR_CODES.UNKNOWN_PACT:
      return new NotFoundError(message)
    case ERROR_CODES.UNAUTHORIZED:
      return new UnauthorizedError(message, 'UNAUTHORIZED')
    case ERROR_CODES.FORBIDDEN_HOST:
      return new UnauthorizedError(message, 'FORBIDDEN_HOST')
    case ERROR_CODES.FORBIDDEN_ORIGIN:
      return new UnauthorizedError(message, 'FORBIDDEN_ORIGIN')
    case ERROR_CODES.BAD_ENTRY:
      return new BadEntryError(message)
    case ERROR_CODES.PAYLOAD_TOO_LARGE:
      return new PayloadTooLargeError(message)
    case ERROR_CODES.TASK_NOT_OPEN:
      return new TaskNotOpenError(message)
    case ERROR_CODES.TASK_ALREADY_CLAIMED:
      return new TaskAlreadyClaimedError(message)
    case ERROR_CODES.TASK_ALREADY_COMPLETE:
      return new TaskAlreadyCompleteError(message)
    case ERROR_CODES.NOT_CLAIMER:
      return new NotClaimerError(message)
    case ERROR_CODES.NOT_CLAIMED:
      return new NotClaimedError(message)
    case ERROR_CODES.NOT_A_MEMBER:
      return new NotAMemberError(message)
    case ERROR_CODES.SKILL_CHECKSUM_MISMATCH:
      return new SkillChecksumMismatchError(message, status)
    case ERROR_CODES.NOT_INDEXER:
      return new NotIndexerError(message)
    case ERROR_CODES.BAD_SKILL_NAME:
      return new BadSkillNameError(message)
    case ERROR_CODES.NOT_CONFIRMED:
      return new NotConfirmedError(message)
    case ERROR_CODES.NOT_CREATOR:
      return new NotCreatorError(message)
    case ERROR_CODES.INVITE_BAD_SHAPE:
      return new InviteBadShapeError(message)
    case ERROR_CODES.INVITE_WRONG_PACT:
      return new InviteWrongPactError(message)
    case ERROR_CODES.UNKNOWN_INVITE:
      return new UnknownInviteError(message)
    case ERROR_CODES.INVITE_REVOKED:
      return new InviteRevokedError(message)
    case ERROR_CODES.INVITE_SPENT:
      return new InviteSpentError(message)
    case ERROR_CODES.INVITE_NOT_INDEXER:
      return new InviteNotIndexerError(message)
    case ERROR_CODES.INVITE_EXPIRED:
      return new InviteExpiredError(message)
    case ERROR_CODES.NO_PEERS:
      return new NoIndexerReachableError(message, 'NO_PEERS')
    case ERROR_CODES.NO_INDEXER_REACHABLE:
    case ERROR_CODES.PEER_DISCONNECTED:
      return new NoIndexerReachableError(message)
    case ERROR_CODES.VIEW_TIMEOUT:
      return new ViewTimeoutError(message)
    case ERROR_CODES.RATE_LIMITED:
      return new RateLimitedError(message)
    case ERROR_CODES.INTERNAL:
      return new DaemonError(message, status, code)
    default:
      return new DaemonError(message, status, code)
  }
}

/**
 * Detect Node fetch's "wrapped network error" pattern and convert
 * ECONNREFUSED to DaemonNotRunningError. Other network errors pass through.
 */
export function mapNetworkError(err: unknown, baseUrl: string): unknown {
  const e = err as { cause?: NodeJS.ErrnoException; message?: string; code?: string }
  const code = e?.cause?.code ?? e?.code
  const causeMsg = e?.cause?.message ?? ''
  const errMsg = e?.message ?? ''
  if (code === 'ECONNREFUSED' || /ECONNREFUSED/.test(causeMsg) || /ECONNREFUSED/.test(errMsg)) {
    return new DaemonNotRunningError(baseUrl)
  }
  return err
}
