import test from 'brittle'
import { createApi } from '../../../src/api'
import { pair } from '../../helpers/pair'
import type { Daemon } from '../../../src/daemon'

test('GET /peers returns the other member with their latest display_name', async (t) => {
  const { a, b } = await pair(t, {
    a: { displayName: 'Alice' },
    b: { displayName: 'Bob' },
  })
  const aApi = createApi(a.daemon)
  t.teardown(() => aApi.close())

  await admitMember(a.daemon, b.daemon)
  await b.daemon.append({
    type: 'knowledge',
    timestamp: new Date().toISOString(),
    agent_id: b.daemon.peerHandle!,
    display_name: 'Bob',
    payload: { topic: 'hello', content: 'bob writes' },
  })

  // Wait for A to (a) see B as a member and (b) index B's entry so the
  // display_name lookup resolves. The activeWriters probe directly checks
  // what the /peers endpoint iterates.
  const deadline = Date.now() + 20_000
  const aBase: any = (a.daemon as any).current?.autobase
  while (Date.now() < deadline) {
    await a.daemon.update()
    const size = aBase?.activeWriters?.size ?? 0
    if (size >= 2) {
      const res = await aApi.inject({ method: 'GET', url: '/v1/pacts/default/peers' })
      const list = JSON.parse(res.body) as Array<{ display_name: string | null }>
      if (list.length >= 1 && list[0].display_name === 'Bob') break
    }
    await new Promise((r) => setTimeout(r, 100))
  }

  const res = await aApi.inject({ method: 'GET', url: '/v1/pacts/default/peers' })
  t.is(res.statusCode, 200)
  const peers = JSON.parse(res.body) as Array<{
    id: string
    remote_key: string
    role: string
    display_name: string | null
    online: boolean
  }>

  t.is(peers.length, 1, 'exactly one other member is visible')
  const p = peers[0]
  t.is(p.remote_key, b.daemon.publicKey, 'remote_key is B autobase member key')
  t.is(p.id, b.daemon.peerHandle, 'id derives from the writer key, matching agent_id on entries')
  t.is(p.display_name, 'Bob', 'display_name comes from the latest entry B authored')
  t.is(p.role, 'member', 'B was admitted as a non-indexer member')
  t.ok(typeof p.online === 'boolean')
})

test('rename propagates: setDisplayName on A is visible on B without A posting content', async (t) => {
  const { a, b } = await pair(t, {
    a: { displayName: 'Alice' },
    b: { displayName: 'Bob' },
  })
  const bApi = createApi(b.daemon)
  t.teardown(() => bApi.close())

  await admitMember(a.daemon, b.daemon)

  // A renames without posting any knowledge/task/message content. The
  // rename-message must replicate and populate B's _agents/ index so
  // the new name is visible via /peers.
  await a.daemon.current!.setDisplayName('Acolyte')

  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    await b.daemon.update()
    const res = await bApi.inject({ method: 'GET', url: '/v1/pacts/default/peers' })
    const list = JSON.parse(res.body) as Array<{ display_name: string | null }>
    if (list[0]?.display_name === 'Acolyte') break
    await new Promise((r) => setTimeout(r, 100))
  }

  const res = await bApi.inject({ method: 'GET', url: '/v1/pacts/default/peers' })
  const peers = JSON.parse(res.body) as Array<{ display_name: string | null }>
  t.is(peers[0]?.display_name, 'Acolyte', 'B observes A renamed via rename-message')
})

test('GET /peers is empty when the peer has not yet been admitted as member', async (t) => {
  const { a } = await pair(t)
  const aApi = createApi(a.daemon)
  t.teardown(() => aApi.close())

  // B is paired via the swarm but never admitted — activeWriters on A still
  // only contains A itself, so /peers is empty.
  const res = await aApi.inject({ method: 'GET', url: '/v1/pacts/default/peers' })
  t.is(res.statusCode, 200)
  t.alike(JSON.parse(res.body), [])
})

async function admitMember(a: Daemon, b: Daemon): Promise<void> {
  const invite = await a.current!.createInvite()
  const redeemed = await b.redeemThroughPeers(a.pactKey!, invite.token, b.publicKey!, {
    timeoutMs: 15000,
  })
  if (!redeemed.ok) throw new Error(`failed to redeem invite: ${JSON.stringify(redeemed)}`)
  await b.waitForWritable({ timeout: 15000 })
}
