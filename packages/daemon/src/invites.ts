import fs from 'fs/promises'
import crypto from 'crypto'
import { pactInvitesPath } from './data-dir'

/*
 * One-time, time-limited invite tokens for writer admission.
 *
 * A creator mints a token; anyone who holds it can call
 * `POST /v1/pacts/:pactId/invites/redeem` against the creator's daemon
 * exactly once (through protomux or in-process), at which point the
 * creator's daemon issues an `admin.addWriter` for the joiner's writer
 * pubkey and an `invite-redeemed` entry marking the nonce spent. The
 * apply() guard (`_invites/<nonce>` view key) enforces single-use across
 * all peers, so even if two indexers were handed the same token at the
 * same time, only the first to land on the confirmed frontier takes
 * effect.
 *
 * MVP decisions:
 *   - Bearer token, not a signed capability. The nonce *is* the secret.
 *     If a token leaks, the leaker can redeem it once (same failure mode
 *     as any bearer credential). Durable read access to the pact is a
 *     separate concern rooted in the discovery key, same as today.
 *   - Creator-local authority. The creator holds the invites.json and
 *     is the only daemon that knows which nonces are live. If the
 *     creator is offline, redemption waits. Phase 2 may extend to
 *     signed, indexer-verifiable tokens if uptime becomes a problem.
 *   - TTL-only expiry. Revocation is a local delete — fine while only
 *     the creator can redeem.
 */

export const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const NONCE_BYTES = 24

export interface Invite {
  nonce: string
  expiresAt: string
  createdAt: string
  ttlMs: number
  pactName: string | null
  issuerDisplay: string | null
  revoked: boolean
  revokedAt: string | null
}

export interface InviteTokenPayload {
  v: 1
  pactId: string
  nonce: string
  expiresAt: string
  pactName: string | null
  issuerDisplay: string | null
}

export interface InvitesFile {
  invites: Invite[]
}

/** Generate a random 48-hex-character nonce (24 bytes of randomness). */
export function newNonce(): string {
  return crypto.randomBytes(NONCE_BYTES).toString('hex')
}

/**
 * Encode a token payload as a base64url string safe for URLs and
 * command-line pasting. The decoder tolerates both padded and
 * unpadded forms (Node's buffer handles either).
 */
export function encodeToken(payload: InviteTokenPayload): string {
  const json = JSON.stringify(payload)
  return Buffer.from(json, 'utf8').toString('base64url')
}

export class InviteDecodeError extends Error {
  readonly code: 'BAD_TOKEN' | 'BAD_VERSION' | 'BAD_SHAPE'
  constructor(code: 'BAD_TOKEN' | 'BAD_VERSION' | 'BAD_SHAPE', message: string) {
    super(message)
    this.code = code
  }
}

export function decodeToken(token: string): InviteTokenPayload {
  if (typeof token !== 'string' || token.length === 0) {
    throw new InviteDecodeError('BAD_TOKEN', 'token must be a non-empty string')
  }
  let json: string
  try {
    json = Buffer.from(token, 'base64url').toString('utf8')
  } catch {
    throw new InviteDecodeError('BAD_TOKEN', 'token is not valid base64url')
  }
  let obj: unknown
  try {
    obj = JSON.parse(json)
  } catch {
    throw new InviteDecodeError('BAD_TOKEN', 'token payload is not valid JSON')
  }
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new InviteDecodeError('BAD_SHAPE', 'token payload must be a JSON object')
  }
  const p = obj as Partial<InviteTokenPayload>
  if (p.v !== 1) {
    throw new InviteDecodeError('BAD_VERSION', `unsupported token version: ${String(p.v)}`)
  }
  if (typeof p.pactId !== 'string' || !/^[0-9a-f]{64}$/i.test(p.pactId)) {
    throw new InviteDecodeError('BAD_SHAPE', 'token.pactId must be 64-hex')
  }
  if (typeof p.nonce !== 'string' || !/^[0-9a-f]{48}$/i.test(p.nonce)) {
    throw new InviteDecodeError('BAD_SHAPE', 'token.nonce must be 48-hex')
  }
  if (typeof p.expiresAt !== 'string' || Number.isNaN(Date.parse(p.expiresAt))) {
    throw new InviteDecodeError('BAD_SHAPE', 'token.expiresAt must be an ISO timestamp')
  }
  return {
    v: 1,
    pactId: p.pactId,
    nonce: p.nonce,
    expiresAt: p.expiresAt,
    pactName: typeof p.pactName === 'string' ? p.pactName : null,
    issuerDisplay: typeof p.issuerDisplay === 'string' ? p.issuerDisplay : null,
  }
}

/** Load the invites file for a pact. Missing file = empty list. */
export async function loadInvites(pactDir: string): Promise<InvitesFile> {
  const file = pactInvitesPath(pactDir)
  let raw: string
  try {
    raw = await fs.readFile(file, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { invites: [] }
    throw err
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new Error(`invites file at ${file} is not valid JSON: ${(err as Error).message}`)
  }
  if (
    parsed === null ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    !Array.isArray((parsed as InvitesFile).invites)
  ) {
    throw new Error(`invites file at ${file} must be { invites: [...] }`)
  }
  return parsed as InvitesFile
}

export async function saveInvites(pactDir: string, file: InvitesFile): Promise<void> {
  await fs.mkdir(pactDir, { recursive: true })
  const target = pactInvitesPath(pactDir)
  const tmp = target + '.tmp'
  await fs.writeFile(tmp, JSON.stringify(file, null, 2) + '\n', 'utf8')
  await fs.rename(tmp, target)
}

export interface InviteSummary {
  nonce: string
  expires_at: string
  created_at: string
  pact_name: string | null
  issuer_display: string | null
  revoked: boolean
  /** true when expiresAt is in the past (relative to `now`) or the invite is revoked. */
  dead: boolean
  /** present when the view's `_invites/<nonce>` already holds a redemption record. */
  redeemed_by?: string | null
}

export function isDead(inv: Invite, now: number): boolean {
  if (inv.revoked) return true
  return Date.parse(inv.expiresAt) <= now
}

export function summarise(inv: Invite, now: number): InviteSummary {
  return {
    nonce: inv.nonce,
    expires_at: inv.expiresAt,
    created_at: inv.createdAt,
    pact_name: inv.pactName,
    issuer_display: inv.issuerDisplay,
    revoked: inv.revoked,
    dead: isDead(inv, now),
  }
}
