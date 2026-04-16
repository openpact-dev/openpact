/**
 * 3-daemon concurrent claim race. All three writers attempt to claim
 * the same task; exactly one wins per the lex-earliest-id tie-break;
 * the other two see TASK_NOT_OPEN after sync. The full task history
 * (returned by GET /v1/tasks/:id once the route layer reduces) shows
 * all three claim attempts.
 */
import test from 'brittle'
import { swarmOf } from '../../helpers/pair'
import { getTaskState } from '../../../src/api/tasks-state'
import type { Daemon } from '../../../src/daemon'

test('3 daemons race to claim one task; exactly one wins', async (t) => {
  const { all, first } = await swarmOf(t, 3)
  const [a, b, c] = all

  await admitMember(a.daemon, b.daemon)
  await admitMember(a.daemon, c.daemon)

  // A creates the task.
  const create = await first.daemon.append({
    type: 'task',
    timestamp: new Date().toISOString(),
    agent_id: first.daemon.peerHandle!,
    payload: { title: 'race', status: 'open' },
  })
  const taskId = create.id

  // Wait for B and C to see the task.
  for (const d of [b.daemon, c.daemon]) {
    const deadline = Date.now() + 10000
    while (Date.now() < deadline) {
      const s = await getTaskState(d.view, taskId)
      if (s) break
      await new Promise((r) => setTimeout(r, 50))
    }
  }

  // All three race. Each appends a `claimed` entry referencing the task.
  await Promise.all(
    all.map((d) =>
      d.daemon.append({
        type: 'task',
        timestamp: new Date().toISOString(),
        agent_id: d.daemon.peerHandle!,
        refs: [taskId],
        payload: {
          title: 'race',
          status: 'claimed',
          claimed_by: d.daemon.peerHandle,
        },
      }),
    ),
  )

  // Wait for all three claim entries to converge on every daemon.
  for (const d of all) {
    const deadline = Date.now() + 15000
    while (Date.now() < deadline) {
      const s = await getTaskState(d.daemon.view, taskId)
      if (s && s.history.length >= 4) break
      await new Promise((r) => setTimeout(r, 50))
    }
  }

  // Each daemon must reduce to the SAME winner.
  const states = await Promise.all(all.map((d) => getTaskState(d.daemon.view, taskId)))
  const winners = states.map((s) => s?.claimed_by)
  t.is(new Set(winners).size, 1, 'all peers agree on the winner')
  t.is(states[0]!.status, 'claimed')
  t.is(states[0]!.history.length, 4, 'history shows the original + 3 claim attempts')

  // The winner must be the writer whose claim entry has the lex-earliest id.
  const claimEntries = states[0]!.history.filter((e) => e.payload.status === 'claimed')
  const lexFirstClaim = [...claimEntries].sort((x, y) => x.id.localeCompare(y.id))[0]
  t.is(states[0]!.claimed_by, lexFirstClaim.agent_id, 'lex-earliest claim wins')
})

async function admitMember(a: Daemon, b: Daemon): Promise<void> {
  const invite = await a.current!.createInvite()
  const redeemed = await b.redeemThroughPeers(a.pactKey!, invite.token, b.publicKey!, {
    timeoutMs: 15000,
  })
  if (!redeemed.ok) throw new Error(`failed to redeem invite: ${JSON.stringify(redeemed)}`)
  await b.waitForWritable({ timeout: 15000 })
}
