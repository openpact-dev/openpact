/**
 * Claimer-offline TTL recovery: A claims a task; A's daemon stops; B
 * (with a clock advanced past TTL) sees the task as effectively open
 * and reclaims it. After the new claim replicates, the system
 * converges on B as claimer.
 */
import test from 'brittle'
import { pair } from '../../helpers/pair'
import { getTaskState } from '../../../src/api/tasks-state'
import type { Daemon } from '../../../src/daemon'

const TTL = 60_000

test('claimer goes offline; B sees expiry and reclaims after TTL', async (t) => {
  // Boot two daemons, each wired to a clock we control. Both must
  // agree on TTL — we pass it as a DaemonOpts knob.
  let now = Date.parse('2026-04-15T00:00:00Z')
  const clockMs = () => now

  const { a, b } = await pair(t, {
    a: { claimTtlMs: TTL, clockMs },
    b: { claimTtlMs: TTL, clockMs },
  })
  await admitMember(a.daemon, b.daemon)

  // A creates and claims the task.
  const create = await a.daemon.append({
    type: 'task',
    timestamp: new Date(now).toISOString(),
    agent_id: a.daemon.peerHandle!,
    payload: { title: 'pickup-after-me', status: 'open' },
  })
  const taskId = create.id

  await a.daemon.append({
    type: 'task',
    timestamp: new Date(now).toISOString(),
    agent_id: a.daemon.peerHandle!,
    refs: [taskId],
    payload: {
      title: 'pickup-after-me',
      status: 'claimed',
      claimed_by: a.daemon.peerHandle,
    },
  })

  // Wait for B to see the claim.
  const seenDeadline = Date.now() + 10000
  while (Date.now() < seenDeadline) {
    const s = await getTaskState(b.daemon.view, taskId, { ttlMs: TTL, clockMs })
    if (s?.status === 'claimed' && s.claimed_by === a.daemon.peerHandle) break
    await new Promise((r) => setTimeout(r, 50))
  }

  const beforeAdvance = await getTaskState(b.daemon.view, taskId, { ttlMs: TTL, clockMs })
  t.is(beforeAdvance!.status, 'claimed', 'B sees A as claimer initially')
  t.is(beforeAdvance!.expired_at, null)

  // A goes offline (simulates a crashed claimer).
  await a.daemon.stop()

  // Advance clock past TTL.
  now += TTL + 5_000
  const afterAdvance = await getTaskState(b.daemon.view, taskId, { ttlMs: TTL, clockMs })
  t.is(afterAdvance!.status, 'open', 'B sees the task as open once TTL elapses')
  t.is(afterAdvance!.claimed_by, null)
  t.ok(afterAdvance!.expired_at, 'expired_at is set')

  // B reclaims by appending a new claim entry with the advanced timestamp.
  await b.daemon.append({
    type: 'task',
    timestamp: new Date(now).toISOString(),
    agent_id: b.daemon.peerHandle!,
    refs: [taskId],
    payload: {
      title: 'pickup-after-me',
      status: 'claimed',
      claimed_by: b.daemon.peerHandle,
    },
  })

  // The reducer should accept B's claim against the expired prior claim.
  const final = await getTaskState(b.daemon.view, taskId, { ttlMs: TTL, clockMs })
  t.is(final!.status, 'claimed', 'B owns the task now')
  t.is(final!.claimed_by, b.daemon.peerHandle)
  t.is(final!.history.length, 3, 'history retains: original + A claim + B claim')
})

async function admitMember(a: Daemon, b: Daemon): Promise<void> {
  const invite = await a.current!.createInvite()
  const redeemed = await b.redeemThroughPeers(a.pactKey!, invite.token, b.publicKey!, {
    timeoutMs: 15000,
  })
  if (!redeemed.ok) throw new Error(`failed to redeem invite: ${JSON.stringify(redeemed)}`)
  await b.waitForWritable({ timeout: 15000 })
}
