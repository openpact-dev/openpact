import test from 'brittle'
import b4a from 'b4a'
import { EventEmitter } from 'events'

import { newPeerLink, type PeerLink } from '../../src/peer-link'
import { requestMemberAuth, backoffDelayMs, AUTH_BACKOFF_MS } from '../../src/member-auth-channel'
import type { MemberAuthRequest, MemberAuthResponse } from '../../src/member-auth-wire'

/**
 * Fake Hyperswarm conn shaped enough for `attachPactToLink` to call
 * `Protomux.from(conn)` without throwing — Protomux registers a 'data'
 * listener on the conn, so we just need to be an EventEmitter that
 * also exposes a stub `userData` slot.
 */
function fakeConn(): any {
  const c: any = new EventEmitter()
  c.userData = null
  c.write = () => true
  c.end = () => {}
  c.destroy = () => {}
  return c
}

/**
 * Build a fake Pact whose membership/verify hooks always succeed for a
 * fixed `memberKey`. `pactKey` is what the caller will see returned via
 * onMemberAuthenticated; the channel uses lowercase-hex compare so we
 * keep both inputs lowercased.
 */
function fakePact(opts: { pactKey: string; memberKey: string }): any {
  return {
    isMember: true,
    pactKey: opts.pactKey,
    verifyMembershipChallenge: () => true,
    hasActiveMemberKey: async (key: string) => key.toLowerCase() === opts.memberKey.toLowerCase(),
    // attachPactToLink calls store.replicate(conn) and iterates store.cores
    // — both no-ops here are enough for the auth-only tests.
    store: { replicate: () => {}, cores: [] },
  }
}

/**
 * Stand-in for the auth Protomux channel. We don't go through Protomux
 * in unit tests — we just rebind the link's `sendAuthRequest` to a
 * function that captures requests, and the test drives responses by
 * resolving the link's `pendingAuth` map directly. This isolates the
 * timeout + retry semantics from the wire-encoding layer.
 */
function attachMockAuthChannel(link: PeerLink, opts: { drop?: boolean } = {}) {
  const sent: MemberAuthRequest[] = []
  link.authChannel = { open: () => {}, close: () => {} }
  link.sendAuthRequest = (req) => {
    sent.push(req)
    return !opts.drop
  }
  return sent
}

test('requestMemberAuth: returns "not-member" when local pact is not yet a member', async (t) => {
  const link = newPeerLink(fakeConn())
  attachMockAuthChannel(link)
  const pact: any = { isMember: false, pactKey: 'aa'.repeat(32), store: { cores: [] } }
  const outcome = await requestMemberAuth(link, pact, { onMemberAuthenticated: () => {} })
  t.is(outcome, 'not-member', 'short-circuits before sending any request')
})

test('requestMemberAuth: returns "channel-closed" when authChannel is null', async (t) => {
  const link = newPeerLink(fakeConn())
  link.authChannel = null
  const pact = fakePact({ pactKey: 'bb'.repeat(32), memberKey: '11'.repeat(32) })
  const outcome = await requestMemberAuth(link, pact, { onMemberAuthenticated: () => {} })
  t.is(outcome, 'channel-closed')
})

test('requestMemberAuth: returns "send-failed" when channel.send returns false', async (t) => {
  const link = newPeerLink(fakeConn())
  attachMockAuthChannel(link, { drop: true })
  const pact = fakePact({ pactKey: 'cc'.repeat(32), memberKey: '22'.repeat(32) })
  const outcome = await requestMemberAuth(link, pact, { onMemberAuthenticated: () => {} })
  t.is(outcome, 'send-failed')
  t.is(link.pendingAuth.size, 0, 'pendingAuth left empty so a retry can proceed')
})

test('requestMemberAuth: returns "timeout" + clears pendingAuth when no response arrives', async (t) => {
  const link = newPeerLink(fakeConn())
  attachMockAuthChannel(link)
  const pact = fakePact({ pactKey: 'dd'.repeat(32), memberKey: '33'.repeat(32) })

  let timeoutFired = false
  const promise = requestMemberAuth(
    link,
    pact,
    {
      onMemberAuthenticated: () => {},
      onTimeout: () => {
        timeoutFired = true
      },
    },
    { timeoutMs: 25 },
  )
  const outcome = await promise
  t.is(outcome, 'timeout')
  t.ok(timeoutFired, 'onTimeout hook fired')
  t.is(link.pendingAuth.size, 0, 'pendingAuth cleared so the next attempt is unblocked')
})

test('requestMemberAuth: full success path emits onAttempt + onMemberAuthenticated, marks authed', async (t) => {
  const link = newPeerLink(fakeConn())
  const sent = attachMockAuthChannel(link)
  const pactKey = 'ee'.repeat(32)
  const memberKey = '44'.repeat(32)
  const pact = fakePact({ pactKey, memberKey })

  let authedKey: string | null = null
  const attempts: number[] = []
  const promise = requestMemberAuth(
    link,
    pact,
    {
      onMemberAuthenticated: (_pactKey, key) => {
        authedKey = key
      },
      onAttempt: (_pactKey, n) => attempts.push(n),
    },
    { timeoutMs: 1_000, attempt: 3 },
  )

  // Drive the response into the pendingAuth map directly — that's
  // exactly what the channel handler does on incoming pong.
  await Promise.resolve()
  t.is(sent.length, 1, 'exactly one wire request was sent')
  const req = sent[0]
  const corrHex = b4a.toString(req.corr, 'hex') as string
  const pending = link.pendingAuth.get(corrHex)
  t.ok(pending, 'request is registered in pendingAuth')
  pending!.resolve({
    corr: req.corr,
    ok: true,
    memberKey,
    signerKey: memberKey,
    signerNamespace: 'autobase/writer/v1',
    compat: false,
    signature: Buffer.from('00'.repeat(64), 'hex'),
  } as MemberAuthResponse)

  const outcome = await promise
  t.is(outcome, 'authed')
  t.is(authedKey, memberKey, 'onMemberAuthenticated received the verified key')
  t.alike(attempts, [3], 'attempt counter forwarded to observer')
  t.is(
    link.authenticatedMembers.get(pactKey.toLowerCase()),
    memberKey.toLowerCase(),
    'authenticatedMembers updated for this pact',
  )
})

test('requestMemberAuth: dropped reply does not block subsequent retries', async (t) => {
  const link = newPeerLink(fakeConn())
  attachMockAuthChannel(link)
  const pact = fakePact({ pactKey: 'ff'.repeat(32), memberKey: '55'.repeat(32) })

  // First attempt times out — the bug we are guarding against is that
  // the timeout leaves a stale pendingAuth entry, which would make
  // every future call return 'pending'.
  const first = await requestMemberAuth(
    link,
    pact,
    { onMemberAuthenticated: () => {} },
    { timeoutMs: 25 },
  )
  t.is(first, 'timeout')

  // Second attempt should also time out — proves the channel is back
  // to "no pending entry exists for this pact" so the retry actually
  // gets to fire its own request.
  const second = await requestMemberAuth(
    link,
    pact,
    { onMemberAuthenticated: () => {} },
    { timeoutMs: 25 },
  )
  t.is(second, 'timeout', 'second attempt was not rejected as "pending"')
})

test('liveness: hasPonged defaults to false on a fresh link', (t) => {
  const link = newPeerLink(fakeConn())
  t.absent(
    link.liveness.hasPonged,
    'un-upgraded peers stay connected until they prove they can pong',
  )
  t.is(link.liveness.missed, 0)
  t.is(link.liveness.pendingPings.size, 0)
})

test('backoffDelayMs: clamps to the schedule', (t) => {
  t.is(backoffDelayMs(1), AUTH_BACKOFF_MS[0])
  t.is(backoffDelayMs(2), AUTH_BACKOFF_MS[1])
  t.is(
    backoffDelayMs(99),
    AUTH_BACKOFF_MS[AUTH_BACKOFF_MS.length - 1],
    'attempts past the schedule clamp to the final entry',
  )
  t.is(backoffDelayMs(0), AUTH_BACKOFF_MS[0], 'attempt < 1 is treated as 1')
})
