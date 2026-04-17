import test from 'brittle'
import { createApi } from '../../../src/api'
import { pair } from '../../helpers/pair'
import type { Daemon } from '../../../src/daemon'

test('GET /agents returns the other member with their latest display_name', async (t) => {
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
  // what the /agents endpoint iterates.
  const deadline = Date.now() + 20_000
  const aBase: any = (a.daemon as any).current?.autobase
  while (Date.now() < deadline) {
    await a.daemon.update()
    const size = aBase?.activeWriters?.size ?? 0
    if (size >= 2) {
      const res = await aApi.inject({ method: 'GET', url: '/v1/pacts/default/agents' })
      const list = JSON.parse(res.body) as Array<{
        display_name: string | null
        is_self?: boolean
      }>
      const remote = list.find((x) => !x.is_self)
      if (remote && remote.display_name === 'Bob') break
    }
    await new Promise((r) => setTimeout(r, 100))
  }

  const res = await aApi.inject({ method: 'GET', url: '/v1/pacts/default/agents' })
  t.is(res.statusCode, 200)
  const agents = JSON.parse(res.body) as Array<{
    id: string
    remote_key: string
    role: string
    display_name: string | null
    online: boolean
    is_self: boolean
  }>

  t.is(agents.length, 2, 'self plus the other member are visible')
  t.is(agents[0].is_self, true, 'self is pinned to the first row')
  t.is(agents[0].role, 'creator', 'A is the creator')
  const bRow = agents.find((x) => !x.is_self)!
  t.is(bRow.remote_key, b.daemon.publicKey, 'remote_key is B autobase member key')
  t.is(bRow.id, b.daemon.peerHandle, 'id derives from the writer key, matching agent_id on entries')
  t.is(bRow.display_name, 'Bob', 'display_name comes from the latest entry B authored')
  t.is(bRow.role, 'member', 'B was admitted as a non-indexer member')
  t.ok(typeof bRow.online === 'boolean')
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
  // the new name is visible via /agents.
  await a.daemon.current!.setDisplayName('Acolyte')

  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    await b.daemon.update()
    const res = await bApi.inject({ method: 'GET', url: '/v1/pacts/default/agents' })
    const list = JSON.parse(res.body) as Array<{
      display_name: string | null
      is_self?: boolean
    }>
    if (list.find((x) => !x.is_self)?.display_name === 'Acolyte') break
    await new Promise((r) => setTimeout(r, 100))
  }

  const res = await bApi.inject({ method: 'GET', url: '/v1/pacts/default/agents' })
  const agents = JSON.parse(res.body) as Array<{
    display_name: string | null
    is_self: boolean
  }>
  const aRow = agents.find((x) => !x.is_self)
  t.is(aRow?.display_name, 'Acolyte', 'B observes A renamed via rename-message')
})

test('GET /agents keeps members after they stop (marked offline, not removed)', async (t) => {
  const { a, b } = await pair(t, {
    a: { displayName: 'Alice' },
    b: { displayName: 'Bob' },
  })
  const aApi = createApi(a.daemon)
  t.teardown(() => aApi.close())

  await admitMember(a.daemon, b.daemon)
  // Capture B's canonical writer key before stopping — publicKey is
  // null once the pact is closed.
  const bKey = b.daemon.publicKey!

  // Wait for B to show up in A's agent list at all.
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    await a.daemon.update()
    const res = await aApi.inject({ method: 'GET', url: '/v1/pacts/default/agents' })
    const list = JSON.parse(res.body) as Array<{ remote_key: string; is_self?: boolean }>
    if (list.some((x) => !x.is_self)) break
    await new Promise((r) => setTimeout(r, 100))
  }

  // B stops cleanly without a self-leave (regular `op stop`). On A,
  // autobase will eventually GC B's writer from activeWriters, but
  // `_members/<B>` stays intact on the ledger.
  await b.daemon.stop()

  const res = await aApi.inject({ method: 'GET', url: '/v1/pacts/default/agents' })
  const agents = JSON.parse(res.body) as Array<{
    remote_key: string
    online: boolean
    is_self: boolean
  }>
  t.is(agents.length, 2, 'self plus B are still listed after B stops')
  const bRow = agents.find((x) => !x.is_self)!
  t.is(bRow.remote_key, bKey, 'same canonical key')
})

test('GET /agents has only the self row when no remote has been admitted', async (t) => {
  const { a } = await pair(t)
  const aApi = createApi(a.daemon)
  t.teardown(() => aApi.close())

  // B is paired via the swarm but never admitted — `_members/` on A
  // still only contains A itself, so /agents is the self row alone.
  const res = await aApi.inject({ method: 'GET', url: '/v1/pacts/default/agents' })
  t.is(res.statusCode, 200)
  const body = JSON.parse(res.body) as Array<{ is_self: boolean }>
  t.is(body.length, 1)
  t.is(body[0].is_self, true)
})

async function admitMember(a: Daemon, b: Daemon): Promise<void> {
  const invite = await a.current!.createInvite()
  const redeemed = await b.redeemThroughPeers(a.pactKey!, invite.token, b.publicKey!, {
    timeoutMs: 15000,
  })
  if (!redeemed.ok) throw new Error(`failed to redeem invite: ${JSON.stringify(redeemed)}`)
  await b.waitForWritable({ timeout: 15000 })
}
