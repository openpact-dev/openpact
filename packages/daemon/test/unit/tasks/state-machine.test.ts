/**
 * Pure-reducer tests for the task state machine. Synthesizes entry
 * streams; never touches a daemon.
 *
 * Lifecycle covered:
 *   open → claimed (first claim wins; later same-type claims ignored)
 *   open → complete (skip-claim by anyone)
 *   claimed → complete (claimer only)
 *   claimed → open (claimer-only release)
 *   illegal: non-claimer complete; non-claimer release; second claim
 *     against an active (non-expired) claim
 */
import test from 'brittle'
import { reduceTaskHistory, type TaskEntry } from '../../../src/api/tasks-state'

const ALICE = 'anon-alice-00010000'
const BOB = 'anon-bob-00020000'

// Pin the wall-clock close to the entry timestamps below so the
// post-reduction wall-clock TTL check (default 24h) never fires
// during these state-machine tests. Expiry is covered separately.
const CLOCK = () => Date.parse('2026-04-15T00:01:00Z')
const REDUCE = (entries: TaskEntry[]) => reduceTaskHistory(entries, { clockMs: CLOCK })

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
  timestamp = '2026-04-15T00:01:00Z',
): TaskEntry {
  return { id, type: 'task', timestamp, agent_id: agent, refs: [ORIG.id], payload }
}

test('original-only history reduces to open', (t) => {
  const s = REDUCE([ORIG])!
  t.is(s.status, 'open')
  t.is(s.claimed_by, null)
  t.is(s.expired_at, null)
})

test('open → claimed: first claim wins', (t) => {
  const claim = update('a000-2', ALICE, { title: 'do it', status: 'claimed', claimed_by: ALICE })
  const s = REDUCE([ORIG, claim])!
  t.is(s.status, 'claimed')
  t.is(s.claimed_by, ALICE)
  t.is(s.claimed_at, claim.timestamp)
})

test('claimed → second simultaneous claim against active claim is ignored', (t) => {
  const a = update('a000-2', ALICE, { title: 'do it', status: 'claimed', claimed_by: ALICE })
  const b = update('a000-3', BOB, { title: 'do it', status: 'claimed', claimed_by: BOB })
  const s = REDUCE([ORIG, a, b])!
  t.is(s.claimed_by, ALICE, 'lex-earlier id wins')
})

test('claimed → complete by claimer succeeds', (t) => {
  const claim = update('a000-2', ALICE, { title: 'do it', status: 'claimed', claimed_by: ALICE })
  const done = update('a000-3', ALICE, {
    title: 'do it',
    status: 'complete',
    claimed_by: ALICE,
    result: 'shipped',
  })
  const s = REDUCE([ORIG, claim, done])!
  t.is(s.status, 'complete')
  t.is(s.result, 'shipped')
})

test('claimed → complete by non-claimer is rejected', (t) => {
  const claim = update('a000-2', ALICE, { title: 'do it', status: 'claimed', claimed_by: ALICE })
  const done = update('a000-3', BOB, {
    title: 'do it',
    status: 'complete',
    claimed_by: ALICE,
    result: 'sneaky',
  })
  const s = REDUCE([ORIG, claim, done])!
  t.is(s.status, 'claimed', 'still claimed')
  t.is(s.claimed_by, ALICE)
})

test('open → complete (skip-claim) is allowed by anyone', (t) => {
  const done = update('a000-2', BOB, { title: 'do it', status: 'complete', result: 'pre-empted' })
  const s = REDUCE([ORIG, done])!
  t.is(s.status, 'complete')
  t.is(s.result, 'pre-empted')
})

test('claimed → open by claimer (release) succeeds', (t) => {
  const claim = update('a000-2', ALICE, { title: 'do it', status: 'claimed', claimed_by: ALICE })
  const release = update('a000-3', ALICE, { title: 'do it', status: 'open', claimed_by: null })
  const s = REDUCE([ORIG, claim, release])!
  t.is(s.status, 'open')
  t.is(s.claimed_by, null)
  t.is(s.claimed_at, null)
})

test('claimed → open by non-claimer (release) is rejected', (t) => {
  const claim = update('a000-2', ALICE, { title: 'do it', status: 'claimed', claimed_by: ALICE })
  const release = update('a000-3', BOB, { title: 'do it', status: 'open', claimed_by: null })
  const s = REDUCE([ORIG, claim, release])!
  t.is(s.status, 'claimed')
  t.is(s.claimed_by, ALICE)
})

test('after release, anyone can re-claim', (t) => {
  const claim1 = update('a000-2', ALICE, { title: 'do it', status: 'claimed', claimed_by: ALICE })
  const release = update('a000-3', ALICE, { title: 'do it', status: 'open', claimed_by: null })
  const claim2 = update('a000-4', BOB, { title: 'do it', status: 'claimed', claimed_by: BOB })
  const s = REDUCE([ORIG, claim1, release, claim2])!
  t.is(s.claimed_by, BOB)
})

test('claim uses writer-bound agent_id, not payload.claimed_by', (t) => {
  // Reducer must trust only `agent_id` (which apply has already verified
  // matches the writer key). A forged `claimed_by` in the payload is
  // ignored for the `claimed_by` state field.
  const claim = update('a000-2', ALICE, {
    title: 'do it',
    status: 'claimed',
    claimed_by: BOB, // payload tries to claim on Bob's behalf
  })
  const s = REDUCE([ORIG, claim])!
  t.is(s.status, 'claimed')
  t.is(s.claimed_by, ALICE, 'claimed_by tracks the writer, not the payload')
})

test('complete rejected when agent_id does not match claimed_by', (t) => {
  // With agent_id now bound to the writer key in apply(), Bob cannot
  // forge a complete for a task Alice has claimed.
  const claim = update('a000-2', ALICE, { title: 'do it', status: 'claimed', claimed_by: ALICE })
  const forged = update('a000-3', BOB, {
    title: 'do it',
    status: 'complete',
    claimed_by: ALICE, // Bob tries to look like he's completing Alice's claim
    result: 'forged',
  })
  const s = REDUCE([ORIG, claim, forged])!
  t.is(s.status, 'claimed', 'forged complete ignored')
  t.is(s.claimed_by, ALICE)
  t.is(s.result, null)
})
