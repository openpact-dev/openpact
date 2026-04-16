import test from 'brittle'
import { pair } from '../helpers/pair'
import type { Daemon } from '../../src/daemon'

test('removePact: leaving daemon tears down its local pact cleanly', async (t) => {
  const { a, b } = await pair(t, {
    a: { displayName: 'Alice' },
    b: { displayName: 'Bob' },
  })

  await admitMember(a.daemon, b.daemon)

  t.ok(b.daemon.current, 'B has a current pact before leaving')
  t.is((await b.daemon.listPacts()).length, 1, 'B starts with one local pact')

  await b.daemon.removePact('default')

  t.is(b.daemon.current, null, 'B no longer has a current pact after leaving')
  t.alike(await b.daemon.listPacts(), [], 'B removes the pact from its local registry')
})

async function admitMember(a: Daemon, b: Daemon): Promise<void> {
  const invite = await a.current!.createInvite()
  const redeemed = await b.redeemThroughPeers(a.pactKey!, invite.token, b.publicKey!, {
    timeoutMs: 15000,
  })
  if (!redeemed.ok) throw new Error(`failed to redeem invite: ${JSON.stringify(redeemed)}`)
  await b.waitForWritable({ timeout: 15000 })
}
