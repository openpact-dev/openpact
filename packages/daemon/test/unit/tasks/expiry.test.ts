/**
 * TTL behaviour. Two layers of expiry:
 *   1. Inter-entry: when reducing entry E_n, the prior claim is
 *      considered expired if E_n.timestamp - last_claim_ts > ttl.
 *   2. Wall-clock: post-reduction, if the current state is `claimed`
 *      and clockMs() - claimed_at > ttl, the route layer reports
 *      status: 'open' + expired_at.
 */
import test from 'brittle'
import { reduceTaskHistory, type TaskEntry } from '../../../src/api/tasks-state'

const ALICE = 'anon-alice-0001'
const BOB = 'anon-bob-0002'
const TTL = 60_000 // 1 minute, for tractable timestamps in tests

const ORIG: TaskEntry = {
  id: 'a000-1',
  type: 'task',
  timestamp: '2026-04-15T00:00:00Z',
  agent_id: ALICE,
  payload: { title: 'do it', status: 'open' },
}

function update(
  id: string,
  agent: string,
  payload: TaskEntry['payload'],
  timestamp: string,
): TaskEntry {
  return { id, type: 'task', timestamp, agent_id: agent, refs: [ORIG.id], payload }
}

test('wall-clock TTL: not yet expired stays claimed', (t) => {
  const claim = update(
    'a000-2',
    ALICE,
    { title: 'do it', status: 'claimed', claimed_by: ALICE },
    '2026-04-15T00:00:00Z',
  )
  // 30s after claim — well within TTL.
  const now = Date.parse('2026-04-15T00:00:30Z')
  const s = reduceTaskHistory([ORIG, claim], { ttlMs: TTL, clockMs: () => now })!
  t.is(s.status, 'claimed')
  t.is(s.claimed_by, ALICE)
  t.is(s.expired_at, null)
})

test('wall-clock TTL: past TTL flips to open + expired_at', (t) => {
  const claim = update(
    'a000-2',
    ALICE,
    { title: 'do it', status: 'claimed', claimed_by: ALICE },
    '2026-04-15T00:00:00Z',
  )
  // 2 min after claim — past TTL.
  const now = Date.parse('2026-04-15T00:02:00Z')
  const s = reduceTaskHistory([ORIG, claim], { ttlMs: TTL, clockMs: () => now })!
  t.is(s.status, 'open')
  t.is(s.claimed_by, null)
  t.is(s.expired_at, '2026-04-15T00:01:00.000Z', 'expired_at = claimed_at + ttl')
  t.is(s.history.length, 2, 'history retains the original claim entry')
})

test('inter-entry TTL: claim against expired claim succeeds in reducer', (t) => {
  const aliceClaim = update(
    'a000-2',
    ALICE,
    { title: 'do it', status: 'claimed', claimed_by: ALICE },
    '2026-04-15T00:00:00Z',
  )
  // Bob claims 5 minutes later — well past TTL.
  const bobClaim = update(
    'a000-3',
    BOB,
    { title: 'do it', status: 'claimed', claimed_by: BOB },
    '2026-04-15T00:05:00Z',
  )
  const s = reduceTaskHistory([ORIG, aliceClaim, bobClaim], {
    ttlMs: TTL,
    // Use a clock far past everything so wall-clock check doesn't add
    // expired_at noise; we want to verify the inter-entry transition.
    clockMs: () => Date.parse('2026-04-15T00:05:01Z'),
  })!
  t.is(s.status, 'claimed')
  t.is(s.claimed_by, BOB, 'Bob took over after Alice timed out')
  t.is(s.claimed_at, '2026-04-15T00:05:00Z')
})

test('inter-entry TTL: claim against active claim is still rejected', (t) => {
  const aliceClaim = update(
    'a000-2',
    ALICE,
    { title: 'do it', status: 'claimed', claimed_by: ALICE },
    '2026-04-15T00:00:00Z',
  )
  // Bob tries 30s later — within TTL.
  const bobClaim = update(
    'a000-3',
    BOB,
    { title: 'do it', status: 'claimed', claimed_by: BOB },
    '2026-04-15T00:00:30Z',
  )
  const s = reduceTaskHistory([ORIG, aliceClaim, bobClaim], {
    ttlMs: TTL,
    // Pin clock so the post-reduction wall-clock TTL check doesn't fire.
    clockMs: () => Date.parse('2026-04-15T00:00:45Z'),
  })!
  t.is(s.claimed_by, ALICE, 'Alice still owns it; Bob ignored')
})

test('inter-entry TTL: complete by non-claimer succeeds after TTL', (t) => {
  const aliceClaim = update(
    'a000-2',
    ALICE,
    { title: 'do it', status: 'claimed', claimed_by: ALICE },
    '2026-04-15T00:00:00Z',
  )
  // Bob completes 10 minutes later — past TTL.
  const bobComplete = update(
    'a000-3',
    BOB,
    { title: 'do it', status: 'complete', result: 'rescued' },
    '2026-04-15T00:10:00Z',
  )
  const s = reduceTaskHistory([ORIG, aliceClaim, bobComplete], {
    ttlMs: TTL,
    clockMs: () => Date.parse('2026-04-15T00:10:01Z'),
  })!
  t.is(s.status, 'complete')
  t.is(s.result, 'rescued')
  t.is(s.claimed_by, null, 'expired claim cleared on rescue-complete')
})

test('inter-entry TTL: release by claimer after TTL is no-op', (t) => {
  const aliceClaim = update(
    'a000-2',
    ALICE,
    { title: 'do it', status: 'claimed', claimed_by: ALICE },
    '2026-04-15T00:00:00Z',
  )
  // Alice tries to release 10 min later — TTL elapsed; release is moot.
  const aliceRelease = update(
    'a000-3',
    ALICE,
    { title: 'do it', status: 'open', claimed_by: null },
    '2026-04-15T00:10:00Z',
  )
  const s = reduceTaskHistory([ORIG, aliceClaim, aliceRelease], {
    ttlMs: TTL,
    clockMs: () => Date.parse('2026-04-15T00:10:01Z'),
  })!
  // The claim has effectively expired; release is silently ignored
  // (no claimer to release). Wall-clock then surfaces it as expired.
  t.is(s.status, 'open')
  t.is(s.claimed_by, null)
  t.ok(s.expired_at, 'still surfaces expired_at')
})

test('default TTL is 24h', (t) => {
  const claim = update(
    'a000-2',
    ALICE,
    { title: 'do it', status: 'claimed', claimed_by: ALICE },
    '2026-04-15T00:00:00Z',
  )
  // 23h later — should still be claimed under the default.
  const now23h = Date.parse('2026-04-15T23:00:00Z')
  const s23h = reduceTaskHistory([ORIG, claim], { clockMs: () => now23h })!
  t.is(s23h.status, 'claimed')

  // 25h later — past the default TTL.
  const now25h = Date.parse('2026-04-16T01:00:00Z')
  const s25h = reduceTaskHistory([ORIG, claim], { clockMs: () => now25h })!
  t.is(s25h.status, 'open')
  t.ok(s25h.expired_at)
})
