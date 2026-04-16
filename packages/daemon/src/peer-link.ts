import b4a from 'b4a'
import Protomux from 'protomux'
import type { Pact } from './pact'
import type { RedeemRequest, RedeemResponse } from './invite-wire'
import type { MemberAuthRequest, MemberAuthResponse } from './member-auth-wire'

/**
 * Per-peer connection state shared by the invite and member-auth
 * Protomux channels. The Daemon owns a `Set<PeerLink>` and wires
 * protocol handlers via the {@link ./invite-channel} and
 * {@link ./member-auth-channel} modules; all cross-link behaviour
 * (reconciliation, revocation) routes through the helpers exported
 * from this file so the Daemon class stays orchestration-only.
 */
export interface PeerLink {
  conn: any
  channel: any
  authChannel: any
  sendRequest: (req: RedeemRequest) => boolean
  sendAuthRequest: (req: MemberAuthRequest) => boolean
  pending: Map<string, (res: RedeemResponse) => void>
  pendingAuth: Map<
    string,
    { pactId: string; challenge: Buffer; resolve: (res: MemberAuthResponse) => void }
  >
  /**
   * pactId (lowercase hex) → remote writer key that this peer claims
   * to control, as signed via member-auth. Populated before the claim
   * has been cross-checked against the indexer's writer set.
   */
  claimedMembers: Map<string, string>
  /**
   * pactId (lowercase hex) → remote writer key that has been
   * cross-checked against the active writer set. Used by peers.ts
   * presence lookup and member-online/offline events.
   */
  authenticatedMembers: Map<string, string>
  revocationTimers: Map<string, ReturnType<typeof setTimeout>>
}

/** Default-populated link with no-op senders; channel openers rebind these. */
export function newPeerLink(conn: any): PeerLink {
  return {
    conn,
    channel: null,
    authChannel: null,
    sendRequest: () => false,
    sendAuthRequest: () => false,
    pending: new Map(),
    pendingAuth: new Map(),
    claimedMembers: new Map(),
    authenticatedMembers: new Map(),
    revocationTimers: new Map(),
  }
}

/** Best-effort destroy — callers shouldn't rely on timely resolution. */
export function destroyPeerLink(link: PeerLink): void {
  try {
    ;(link.conn as { destroy?: () => void }).destroy?.()
  } catch {
    // Swallow: Hyperswarm streams raise on double-destroy; the caller
    // already ran 'close' cleanup.
  }
}

export function clearRevocationTimer(link: PeerLink, pactId: string): void {
  const timer = link.revocationTimers.get(pactId)
  if (!timer) return
  clearTimeout(timer)
  link.revocationTimers.delete(pactId)
}

/**
 * Schedule a delayed disconnect if `remoteMemberKey` is no longer in
 * the active writer set after 500ms. Gives autobase time to surface
 * re-admission (the common case: a writer gets removed and re-added
 * in the same view) before we kill the replication link.
 */
export function scheduleRevocationDisconnect(
  link: PeerLink,
  pact: Pact,
  pactId: string,
  remoteMemberKey: string,
  peerLinks: Set<PeerLink>,
): void {
  if (link.revocationTimers.has(pactId)) return
  const timer = setTimeout(() => {
    link.revocationTimers.delete(pactId)
    void (async () => {
      if (!peerLinks.has(link)) return
      if (link.authenticatedMembers.get(pactId) !== remoteMemberKey) return
      if (!(await pact.hasActiveMemberKey(remoteMemberKey))) destroyPeerLink(link)
    })()
  }, 500)
  link.revocationTimers.set(pactId, timer)
}

/**
 * Begin replicating `pact` over `link.conn`. Each core in the pact's
 * corestore is attached to the peer's Protomux so autobase can fan
 * writes out over the same mux the invite/member-auth channels share.
 */
export function attachPactToLink(pact: Pact, link: PeerLink): void {
  pact.store.replicate(link.conn)
  const muxer = Protomux.from(link.conn as any)
  const tracker = pact.store?.cores
  if (!tracker || typeof tracker[Symbol.iterator] !== 'function') return
  for (const core of tracker as Iterable<any>) {
    if (!core?.opened || !core?.replicator?.attached || !core?.replicator?.attachTo) continue
    if (!core.replicator.attached(muxer)) {
      core.replicator.attachTo(muxer)
    }
  }
}

/** Hex key used for the corr-ID → resolver maps on a link. */
export function corrKey(buf: Buffer): string {
  return b4a.toString(buf, 'hex') as string
}
