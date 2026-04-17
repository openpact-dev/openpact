import test from 'brittle'
import { pair } from '../helpers/pair'
import type { Daemon } from '../../src/daemon'

/**
 * Severs every live PeerLink underneath a daemon by destroying its
 * conn objects directly. Mirrors what happens when the underlying TCP
 * stream dies (laptop sleep, NAT drop, network change) without a
 * clean FIN. Returns the count of conns that were torn down.
 */
function severAllPeerLinks(daemon: Daemon): number {
  // Reach into the private set — tests own this contract.
  const links = (daemon as any)._peerLinks as Set<{ conn: any }>
  let count = 0
  for (const link of links) {
    try {
      link.conn?.destroy?.()
      count += 1
    } catch {
      /* ignore */
    }
  }
  return count
}

async function admitMember(a: Daemon, b: Daemon): Promise<void> {
  const invite = await a.current!.createInvite()
  const redeemed = await b.redeemThroughPeers(a.pactKey!, invite.token, b.publicKey!, {
    timeoutMs: 15_000,
  })
  if (!redeemed.ok) throw new Error(`failed to redeem invite: ${JSON.stringify(redeemed)}`)
  await b.waitForWritable({ timeout: 15_000 })
}

function onlineMemberKeys(daemon: Daemon, pactKey: string): Set<string> {
  return daemon.onlineMembers(pactKey)
}

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  {
    timeout = 30_000,
    interval = 100,
    label,
  }: { timeout?: number; interval?: number; label: string },
): Promise<void> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await predicate()) return
    await new Promise((r) => setTimeout(r, interval))
  }
  throw new Error(`waitFor(${label}) timeout after ${timeout}ms`)
}

test('severed conns trigger reconnect + re-auth on both sides', async (t) => {
  const { a, b } = await pair(t)
  await admitMember(a.daemon, b.daemon)

  // Wait for both sides to mark each other online via member-auth.
  // Pre-condition for the test — if this never happens the bug is
  // upstream of what we're trying to verify.
  await waitFor(
    () =>
      onlineMemberKeys(a.daemon, a.daemon.pactKey!).has(b.daemon.publicKey!.toLowerCase()) &&
      onlineMemberKeys(b.daemon, b.daemon.pactKey!).has(a.daemon.publicKey!.toLowerCase()),
    { timeout: 15_000, label: 'initial bidirectional auth' },
  )

  // Sever every conn from A's side. The kernel pushes RSTs to B, but
  // the test exercises both halves: B will see its conn close
  // immediately, A's local link removal also fires. We're checking
  // that the auth retry loop + Hyperswarm reconnect cooperate to put
  // both back to "online" without manual intervention.
  const severed = severAllPeerLinks(a.daemon)
  t.ok(severed > 0, `severed at least one conn (got ${severed})`)

  // Both sides should briefly drop to "offline" — wait for that, then
  // confirm we recover. A 30s ceiling covers worst-case Hyperswarm
  // rediscovery under a stressed CI host.
  await waitFor(
    () =>
      !onlineMemberKeys(a.daemon, a.daemon.pactKey!).has(b.daemon.publicKey!.toLowerCase()) &&
      !onlineMemberKeys(b.daemon, b.daemon.pactKey!).has(a.daemon.publicKey!.toLowerCase()),
    { timeout: 5_000, label: 'both peers transitioned to offline' },
  )
  t.pass('both peers saw the offline transition after sever')

  await waitFor(
    () =>
      onlineMemberKeys(a.daemon, a.daemon.pactKey!).has(b.daemon.publicKey!.toLowerCase()) &&
      onlineMemberKeys(b.daemon, b.daemon.pactKey!).has(a.daemon.publicKey!.toLowerCase()),
    { timeout: 30_000, label: 'bidirectional re-auth after reconnect' },
  )
  t.pass('both peers re-authenticated after reconnect')

  // Sanity check: post a knowledge entry from A and confirm B applies
  // it. If replication got wedged by the disconnect, online would lie.
  await a.daemon.append({
    type: 'knowledge',
    timestamp: new Date().toISOString(),
    agent_id: a.daemon.peerHandle!,
    payload: { topic: 'after-reconnect', content: 'still talking' },
  })
  await waitFor(
    async () => {
      await b.daemon.update()
      const stream = b.daemon.view.createReadStream({ gte: 'knowledge/', lt: 'knowledge0' })
      for await (const { value } of stream) {
        if (value?.payload?.content === 'still talking') return true
      }
      return false
    },
    { timeout: 15_000, label: 'B applies post-reconnect knowledge entry' },
  )
  t.pass('replication resumed after reconnect')
})
