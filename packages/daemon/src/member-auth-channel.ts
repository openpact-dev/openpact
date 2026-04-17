import crypto from 'crypto'
import b4a from 'b4a'
import {
  PROTOCOL,
  memberAuthRequestEnc,
  memberAuthResponseEnc,
  memberAuthPingEnc,
  memberAuthPongEnc,
  type MemberAuthRequest,
  type MemberAuthResponse,
  type MemberAuthPing,
  type MemberAuthPong,
} from './member-auth-wire'
import type { Pact } from './pact'
import {
  corrKey,
  attachPactToLink,
  clearRevocationTimer,
  clearAuthRetry,
  stopLiveness,
  type PeerLink,
} from './peer-link'

/**
 * Auth + liveness tunables. These are module-level so tests can
 * monkey-patch them via the named exports — the values are baked into
 * production builds at the defaults below.
 *
 * - AUTH_RESPONSE_TIMEOUT_MS bounds how long `requestMemberAuth`
 *   awaits a reply before considering the attempt failed; without
 *   this guard a dropped reply hangs the pendingAuth promise forever
 *   and the "skip if pending exists" guard then blocks every future
 *   attempt on the same link/pact.
 * - AUTH_BACKOFF_MS is the schedule of delays before each retry. The
 *   final entry is repeated indefinitely (clamped to ~1 minute). The
 *   first attempt is fired immediately; index 0 is the wait BEFORE
 *   the second attempt.
 * - LIVENESS_INTERVAL_MS is how often each peer sends a ping. The
 *   pong is awaited up to LIVENESS_PING_TIMEOUT_MS; after
 *   LIVENESS_MAX_MISSES consecutive missed pongs the link is
 *   destroyed and Hyperswarm reconnect kicks in.
 */
export const AUTH_RESPONSE_TIMEOUT_MS = 5_000
export const AUTH_BACKOFF_MS = [250, 1_000, 4_000, 15_000, 60_000]
export const LIVENESS_INTERVAL_MS = 15_000
export const LIVENESS_PING_TIMEOUT_MS = 5_000
export const LIVENESS_MAX_MISSES = 3

export interface MemberAuthChannelHandlers {
  handleMemberAuthRequest(req: MemberAuthRequest): Promise<MemberAuthResponse>
  /**
   * Liveness gave up on this link — destroy the conn so Hyperswarm
   * reopens a fresh one. The Daemon's `conn.on('close')` handler
   * does the rest.
   */
  onLivenessDead(link: PeerLink, missed: number): void
  /** Optional observability hooks. */
  onLivenessMiss?(link: PeerLink, missed: number): void
  onLivenessRecover?(link: PeerLink): void
}

/** Wire the `openpact/member-auth/v1` channel onto `link`. */
export function openMemberAuthChannel(
  link: PeerLink,
  mux: any,
  handlers: MemberAuthChannelHandlers,
): void {
  let sendResponse: any = null
  let sendPongMsg: any = null
  const channel = mux.createChannel({
    protocol: PROTOCOL,
    onclose: () => {
      for (const { resolve } of link.pendingAuth.values()) {
        resolve({
          corr: Buffer.alloc(0),
          ok: false,
          code: 'PEER_DISCONNECTED',
          message: 'peer disconnected before responding',
        })
      }
      link.pendingAuth.clear()
      stopLiveness(link)
    },
  })
  if (!channel) {
    link.authChannel = null
    link.sendAuthRequest = () => false
    link.sendPing = () => false
    link.sendPong = () => false
    return
  }

  // Message order MUST match on both sides — Protomux assigns
  // sequential IDs in addMessage call order. Don't reorder.
  const requestMsg = channel.addMessage({
    encoding: memberAuthRequestEnc,
    onmessage: (req: MemberAuthRequest) => {
      handlers
        .handleMemberAuthRequest(req)
        .then((res) => sendResponse && sendResponse.send({ ...res, corr: req.corr }))
        .catch(
          (err) =>
            sendResponse &&
            sendResponse.send({
              corr: req.corr,
              ok: false,
              code: 'INTERNAL',
              message: (err as Error).message,
            }),
        )
    },
  })
  const responseMsg = channel.addMessage({
    encoding: memberAuthResponseEnc,
    onmessage: (res: MemberAuthResponse) => {
      const key = corrKey(res.corr)
      const pending = link.pendingAuth.get(key)
      if (!pending) return
      link.pendingAuth.delete(key)
      pending.resolve(res)
    },
  })
  const pingMsg = channel.addMessage({
    encoding: memberAuthPingEnc,
    onmessage: (req: MemberAuthPing) => {
      // Echo any incoming ping. The remote's interval also runs from
      // their side, so we don't need to initiate; we just mirror.
      if (sendPongMsg) sendPongMsg.send({ corr: req.corr })
    },
  })
  const pongMsg = channel.addMessage({
    encoding: memberAuthPongEnc,
    onmessage: (res: MemberAuthPong) => {
      const key = corrKey(res.corr)
      if (!link.liveness.pendingPings.delete(key)) return
      link.liveness.lastPongAt = Date.now()
      const wasMissed = link.liveness.missed > 0
      link.liveness.missed = 0
      if (wasMissed) handlers.onLivenessRecover?.(link)
    },
  })
  sendResponse = responseMsg
  sendPongMsg = pongMsg
  channel.open()
  link.authChannel = channel
  link.sendAuthRequest = (req) => requestMsg.send(req)
  link.sendPing = (req) => pingMsg.send(req)
  link.sendPong = (res) => pongMsg.send(res)

  startLiveness(link, handlers)
}

/**
 * Begin the periodic ping loop. Each tick:
 *   1. Promote any unanswered ping from the previous tick into the
 *      "missed" counter — the pong window has elapsed.
 *   2. If we've crossed LIVENESS_MAX_MISSES, fire the dead callback
 *      and stop. The Daemon will destroy the conn; Hyperswarm
 *      reconnects.
 *   3. Otherwise, queue a fresh ping with a unique corr token.
 *
 * Notes:
 *   - Interval is `unref`'d so a stuck link doesn't hold the event
 *     loop open during shutdown — `Daemon.stop` still tears it down
 *     explicitly via `stopLiveness`.
 *   - The pong matcher in the channel handler clears `missed` on any
 *     reply, so a brief stall (one missed window) self-heals.
 */
function startLiveness(link: PeerLink, handlers: MemberAuthChannelHandlers): void {
  if (link.liveness.interval) clearInterval(link.liveness.interval)
  link.liveness.lastPongAt = Date.now()
  link.liveness.missed = 0
  link.liveness.pendingPings.clear()

  const tick = () => {
    // Anything still in pendingPings has had at least
    // LIVENESS_PING_TIMEOUT_MS to come back; treat them as missed.
    if (link.liveness.pendingPings.size > 0) {
      link.liveness.missed += 1
      link.liveness.pendingPings.clear()
      handlers.onLivenessMiss?.(link, link.liveness.missed)
      if (link.liveness.missed >= LIVENESS_MAX_MISSES) {
        stopLiveness(link)
        handlers.onLivenessDead(link, link.liveness.missed)
        return
      }
    }
    const corr = crypto.randomBytes(8)
    const key = corrKey(corr as Buffer)
    link.liveness.pendingPings.add(key)
    const sent = link.sendPing({ corr: corr as Buffer })
    if (!sent) link.liveness.pendingPings.delete(key)
  }

  // Wait one interval before the first ping so we don't double up
  // with the auth handshake's own request/response in the first
  // hundred ms after channel open. The pong matcher resets `missed`
  // immediately, so this only delays the very first liveness signal.
  const interval = setInterval(tick, LIVENESS_INTERVAL_MS)
  // Pre-seed lastPongAt to "now" so peers that never trigger a tick
  // (e.g. the conn dies before the first interval) don't surface
  // bogus age values to observers.
  interval.unref?.()
  link.liveness.interval = interval
}

/**
 * Daemon-supplied hook invoked after a successful member-auth
 * exchange on a remote key that the local pact confirms is an
 * active member. The Daemon turns this into a `member-online`
 * event on its public EventEmitter.
 */
export interface MemberAuthContext {
  onMemberAuthenticated(pactKey: string, memberKey: string): void
  /** Fires every time we put a new request on the wire. Diagnostic only. */
  onAttempt?(pactKey: string, attempt: number): void
  /** Fires when a request times out without a verifiable response. */
  onTimeout?(pactKey: string, attempt: number): void
  /** Fires when a response was returned but didn't validate or wasn't an active member. */
  onFail?(pactKey: string, reason: string): void
}

/**
 * One-shot member-auth attempt with bounded wait. Returns
 *   - `'authed'` on full success (verified + active member);
 *   - `'channel-closed'` if the auth channel is gone (link dying);
 *   - `'not-member'` if our local pact isn't a member of `pact` yet
 *     (joiner pre-admission window — caller should defer);
 *   - `'pending'` if another attempt is already in flight for this
 *     (link, pact);
 *   - `'timeout'` if the response didn't arrive in time;
 *   - `'send-failed'` if the channel returned false from .send();
 *   - `'verify-failed'` if the response was malformed or the
 *     signature didn't validate;
 *   - `'not-active'` if the signed key isn't in the active member set.
 *
 * Caller drives the retry schedule based on the return value — this
 * function has no side-effects beyond updating the link's
 * authenticated maps on success.
 */
export type MemberAuthOutcome =
  | 'authed'
  | 'channel-closed'
  | 'not-member'
  | 'pending'
  | 'timeout'
  | 'send-failed'
  | 'verify-failed'
  | 'not-active'

export async function requestMemberAuth(
  link: PeerLink,
  pact: Pact,
  ctx: MemberAuthContext,
  opts: { timeoutMs?: number; attempt?: number } = {},
): Promise<MemberAuthOutcome> {
  if (!pact.isMember) return 'not-member'
  if (!link.authChannel) return 'channel-closed'
  const pactId = pact.pactKey?.toLowerCase()
  if (!pactId) return 'not-member'
  if (link.authenticatedMembers.has(pactId)) return 'authed'
  for (const pending of link.pendingAuth.values()) {
    if (pending.pactId === pactId) return 'pending'
  }

  const timeoutMs = opts.timeoutMs ?? AUTH_RESPONSE_TIMEOUT_MS
  const attempt = opts.attempt ?? 1
  ctx.onAttempt?.(pactId, attempt)

  const corr = crypto.randomBytes(8) as Buffer
  const key = corrKey(corr)
  const challenge = crypto.randomBytes(32) as Buffer
  const req: MemberAuthRequest = { pactId, challenge, corr }

  let timer: ReturnType<typeof setTimeout> | null = null
  const response = new Promise<MemberAuthResponse | null>((resolve) => {
    link.pendingAuth.set(key, { pactId, challenge, resolve: (r) => resolve(r) })
    timer = setTimeout(() => {
      // Drop our pending entry so a future retry isn't blocked by the
      // "skip if pending exists" guard. The remote's late reply (if it
      // ever arrives) will hit the `!pending` branch in the channel
      // handler and be discarded.
      if (link.pendingAuth.delete(key)) resolve(null)
    }, timeoutMs)
  })
  const sent = link.sendAuthRequest(req)
  if (!sent) {
    if (timer) clearTimeout(timer)
    link.pendingAuth.delete(key)
    return 'send-failed'
  }
  const res = await response
  if (timer) clearTimeout(timer)
  if (!res) {
    ctx.onTimeout?.(pactId, attempt)
    return 'timeout'
  }
  if (!res.ok || !res.memberKey || !res.signerKey || !res.signature) {
    ctx.onFail?.(pactId, res.code || 'verify-failed')
    return 'verify-failed'
  }
  if (
    !pact.verifyMembershipChallenge(
      challenge,
      pactId,
      res.signature,
      res.memberKey,
      res.signerKey,
      res.signerNamespace,
      res.compat,
    )
  ) {
    ctx.onFail?.(pactId, 'signature-mismatch')
    return 'verify-failed'
  }
  const memberKey = res.memberKey.toLowerCase()
  link.claimedMembers.set(pactId, memberKey)
  if (!(await pact.hasActiveMemberKey(memberKey))) {
    ctx.onFail?.(pactId, 'not-active-member')
    return 'not-active'
  }
  clearRevocationTimer(link, pactId)
  clearAuthRetry(link, pactId)
  const wasAuthed = link.authenticatedMembers.has(pactId)
  link.authenticatedMembers.set(pactId, memberKey)
  attachPactToLink(pact, link)
  if (!wasAuthed) ctx.onMemberAuthenticated(pact.pactKey as string, memberKey)
  return 'authed'
}

/** Backoff selector: clamp `attempt` to the schedule's last entry. */
export function backoffDelayMs(attempt: number): number {
  if (attempt < 1) return AUTH_BACKOFF_MS[0]
  const idx = Math.min(attempt - 1, AUTH_BACKOFF_MS.length - 1)
  return AUTH_BACKOFF_MS[idx]
}

/** Helper to build a stable hex string from a binary key for log output. */
export function shortKey(buf: Buffer | string | null | undefined): string | null {
  if (!buf) return null
  const hex = typeof buf === 'string' ? buf : (b4a.toString(buf, 'hex') as string)
  return hex.slice(0, 16)
}
