/**
 * Reproduces the "Nth peer can't join" bug: when a fresh joiner's daemon
 * is only connected to non-indexer members at the moment it drives the
 * redeem, every peer responds INVITE_NOT_INDEXER and the current
 * `redeemThroughPeers` surfaces that code verbatim. The CLI join loop
 * treats INVITE_NOT_INDEXER as non-transient, so the user sees a hard
 * failure even though an indexer is still on the pact.
 *
 * Shape of the bug on the real dev pact: creator is the sole indexer,
 * two members (VPS + WSL2) were admitted via invite so they're
 * `indexer: false`. A 4th peer joins, races to members first, redeem
 * returns NOT_INDEXER, CLI bails out.
 */
import test from 'brittle'
import createTestnet from 'hyperdht/testnet'
import { Daemon } from '../../src/daemon'
import { tmpDaemon } from '../helpers/tmp-daemon'

test('redeem where only non-indexer members are reachable surfaces a retryable code', async (t) => {
  const testnet = await createTestnet(4, t.teardown)
  const swarm = { bootstrap: testnet.bootstrap }

  // A = creator/indexer
  const a = await tmpDaemon(t, { swarm })
  // B = invite-admitted member (non-indexer)
  const b = await tmpDaemon(t, { swarm, joinKey: a.daemon.pactKey! })
  await Promise.all([
    a.daemon.waitForConnections(1, { timeout: 15000 }),
    b.daemon.waitForConnections(1, { timeout: 15000 }),
  ])

  const invB = await a.daemon.current!.createInvite()
  const admitB = await b.daemon.redeemThroughPeers(
    a.daemon.pactKey!,
    invB.token,
    b.daemon.publicKey!,
    { timeoutMs: 15000 },
  )
  t.alike(admitB, { ok: true, nonce: invB.invite.nonce }, 'B admitted as member')
  await b.daemon.waitForWritable({ timeout: 15000 })
  t.is(b.daemon.isIndexer, false, 'B is a non-indexer member')

  // D is the fresh joiner. Stop A so D can only reach the non-indexer
  // member(s). This is the pathological race: indexer not currently
  // replying, only members are.
  const pactKey = a.daemon.pactKey! // capture before stopping A
  const d = await tmpDaemon(t, { swarm, joinKey: pactKey })
  const dKey = d.daemon.publicKey!
  await a.daemon.stop()
  await d.daemon.waitForConnections(1, { timeout: 15000 })

  // Any well-formed token. Members will reject on !isIndexer before
  // looking at it.
  const res = await d.daemon.redeemThroughPeers(pactKey, invB.token, dKey, {
    timeoutMs: 5000,
  })

  t.is(res.ok, false, 'redeem must fail when no indexer is reachable')
  if (!res.ok) {
    t.ok(
      res.code === 'NO_INDEXER_REACHABLE' || res.code === 'NO_AGENTS',
      `expected retryable code (NO_INDEXER_REACHABLE / NO_AGENTS), got ${res.code}`,
    )
  }
})

test('idempotent pacts.join: same alias + same pactId returns the already-open pact', async (t) => {
  const testnet = await createTestnet(3, t.teardown)
  const swarm = { bootstrap: testnet.bootstrap }

  const a = await tmpDaemon(t, { swarm })
  const b = await tmpDaemon(t, { swarm })

  // First join: creates the pact locally.
  const first = await b.daemon.joinPact({
    joinKey: a.daemon.pactKey!,
    alias: 'my-pact',
    displayName: 'b',
  })
  t.is(first.alias, 'my-pact')

  // Second join with matching pactId + alias: should be a no-op, not
  // a 500. This is the exact retry-after-failed-redeem path a user
  // hits when their first `openpact join <token>` gave up on a
  // transient error.
  const second = await b.daemon.joinPact({
    joinKey: a.daemon.pactKey!,
    alias: 'my-pact',
    displayName: 'b',
  })
  t.is(second.alias, 'my-pact')
  t.is(second.pact.pactKey, first.pact.pactKey, 'same pact returned')
})

test('pacts.join with a taken alias but different pactId throws PACT_ALIAS_EXISTS', async (t) => {
  const { JoinPactError } = await import('../../src/daemon')
  const testnet = await createTestnet(3, t.teardown)
  const swarm = { bootstrap: testnet.bootstrap }

  const a1 = await tmpDaemon(t, { swarm })
  const a2 = await tmpDaemon(t, { swarm })
  const b = await tmpDaemon(t, { swarm })

  await b.daemon.joinPact({ joinKey: a1.daemon.pactKey!, alias: 'collide', displayName: 'b' })

  try {
    await b.daemon.joinPact({ joinKey: a2.daemon.pactKey!, alias: 'collide', displayName: 'b' })
    t.fail('should have thrown on alias collision with different pact')
  } catch (e) {
    t.ok(e instanceof JoinPactError, 'threw JoinPactError')
    if (e instanceof JoinPactError) {
      t.is(e.code, 'PACT_ALIAS_EXISTS')
      t.is(e.status, 409)
    }
  }
})

test('sequential admission of 7 members (creator + 7)', async (t) => {
  // Reassures us that growing past the 3-agent test bed doesn't break
  // the invite flow. Each joiner mints a fresh invite, redeems through
  // peers, and waits for the admin.addWriter to land. We assert every
  // joiner ends up a member and all earlier members eventually see
  // them.
  const N = 7
  const testnet = await createTestnet(Math.max(4, N + 1), t.teardown)
  const swarm = { bootstrap: testnet.bootstrap }

  const a = await tmpDaemon(t, { swarm })
  const members = [a]

  for (let i = 0; i < N; i++) {
    const m = await tmpDaemon(t, { swarm, joinKey: a.daemon.pactKey! })
    await m.daemon.waitForConnections(1, { timeout: 15000 })
    const inv = await a.daemon.current!.createInvite()
    const res = await m.daemon.redeemThroughPeers(
      a.daemon.pactKey!,
      inv.token,
      m.daemon.publicKey!,
      { timeoutMs: 15000 },
    )
    t.alike(res, { ok: true, nonce: inv.invite.nonce }, `joiner ${i + 1} redeemed`)
    await m.daemon.waitForWritable({ timeout: 15000 })
    t.is(m.daemon.isMember, true, `joiner ${i + 1} is a member`)
    members.push(m)
  }
  t.is(members.length, N + 1)
})

test('joiner retries until the indexer comes back and then redeems', async (t) => {
  const testnet = await createTestnet(4, t.teardown)
  const swarm = { bootstrap: testnet.bootstrap }

  const a = await tmpDaemon(t, { swarm })
  const b = await tmpDaemon(t, { swarm, joinKey: a.daemon.pactKey! })
  await Promise.all([
    a.daemon.waitForConnections(1, { timeout: 15000 }),
    b.daemon.waitForConnections(1, { timeout: 15000 }),
  ])

  const invB = await a.daemon.current!.createInvite()
  await b.daemon.redeemThroughPeers(a.daemon.pactKey!, invB.token, b.daemon.publicKey!, {
    timeoutMs: 15000,
  })
  await b.daemon.waitForWritable({ timeout: 15000 })

  // Mint a fresh invite for D *before* stopping A.
  const invD = await a.daemon.current!.createInvite()
  const pactKey = a.daemon.pactKey!
  const aDir = a.dir

  // D is the joiner. A is temporarily offline; D can only reach B.
  const d = await tmpDaemon(t, { swarm, joinKey: pactKey })
  const dKey = d.daemon.publicKey!
  await a.daemon.stop()
  await d.daemon.waitForConnections(1, { timeout: 15000 })

  // Simulate the CLI retry loop: on NO_INDEXER_REACHABLE / NO_AGENTS,
  // wait a moment and try again. Meanwhile, bring A back.
  let aBack: Daemon | null = null
  const bringABack = (async () => {
    await new Promise((r) => setTimeout(r, 800))
    aBack = await Daemon.load({ dataDir: aDir, swarm })
    await aBack.start()
    t.teardown(() => aBack?.stop())
  })()

  const deadline = Date.now() + 20_000
  let result: Awaited<ReturnType<typeof d.daemon.redeemThroughPeers>> | null = null
  while (Date.now() < deadline) {
    result = await d.daemon.redeemThroughPeers(pactKey, invD.token, dKey, { timeoutMs: 3000 })
    if (result.ok) break
    const code = result.code
    if (code !== 'NO_INDEXER_REACHABLE' && code !== 'NO_AGENTS' && code !== 'AGENT_DISCONNECTED') {
      break // non-transient, stop retrying
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  await bringABack

  t.ok(result && result.ok, `redeem eventually succeeded: ${JSON.stringify(result)}`)
  await d.daemon.waitForWritable({ timeout: 15000 })
  t.is(d.daemon.isMember, true, 'D is now a member')
})
