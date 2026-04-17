import test from 'brittle'
import { pair } from '../helpers/pair'
import type { Daemon } from '../../src/daemon'

async function admitMember(a: Daemon, b: Daemon): Promise<void> {
  const invite = await a.current!.createInvite()
  const redeemed = await b.redeemThroughPeers(a.pactKey!, invite.token, b.publicKey!, {
    timeoutMs: 15_000,
  })
  if (!redeemed.ok) throw new Error(`failed to redeem invite: ${JSON.stringify(redeemed)}`)
  await b.waitForWritable({ timeout: 15_000 })
}

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  {
    timeout = 15_000,
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

test('creator setPactInfo replicates to joiner via admin.setInfo', async (t) => {
  const { a, b } = await pair(t, {
    a: { pactName: 'Original', pactPurpose: 'first' },
  })
  await admitMember(a.daemon, b.daemon)

  // Pre-condition: B sees A's original name once replication catches up.
  // (It won't necessarily have it yet — pre-admission-era configs don't
  // sync. The new admin.setInfo path is what the test is actually for.)
  await a.daemon.current!.setPactInfo({
    name: 'The Obsidian Accord',
    purpose: 'a pact among daemons',
  })

  await waitFor(
    async () => {
      await b.daemon.update()
      return (
        b.daemon.current!.pactName === 'The Obsidian Accord' &&
        b.daemon.current!.pactPurpose === 'a pact among daemons'
      )
    },
    { timeout: 15_000, label: 'B receives A setInfo' },
  )
  t.pass('joiner saw the creator-renamed pact')

  // Second round: clear the purpose, change the name. Verifies both
  // the update-to-new-value and the null-clears-value paths on a
  // live link.
  await a.daemon.current!.setPactInfo({ name: 'Ember Rite', purpose: null })
  await waitFor(
    async () => {
      await b.daemon.update()
      return b.daemon.current!.pactName === 'Ember Rite' && b.daemon.current!.pactPurpose === null
    },
    { timeout: 15_000, label: 'B receives second setInfo (rename + clear purpose)' },
  )
  t.pass('subsequent setInfo (including null clear) also replicated')
})

test('setPactInfo from a non-writer is local-only (no ledger entry)', async (t) => {
  // Joiner pre-admission: they aren't writable yet, so setPactInfo
  // must not try to append (apply would reject it anyway). Local
  // state still updates so the dashboard stays responsive.
  const { a, b } = await pair(t)
  // Intentionally skip admission so B stays a non-member/non-writer.
  t.absent(b.daemon.isWriter, 'B is not yet a writer')
  await b.daemon.current!.setPactInfo({ name: 'Joiner Preview', purpose: 'hopeful' })
  t.is(b.daemon.pactName, 'Joiner Preview', 'local-only update applied')
  // A's view has no setInfo entry — we didn't append anything
  // through the ledger.
  const nameRow = await a.daemon.view!.get('_pact/name')
  t.absent(nameRow, 'no admin.setInfo leaked from the non-writer')
})
