import test from 'brittle'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import createTestnet from 'hyperdht/testnet'
import { Daemon } from '../../src/daemon'
import { createApi } from '../../src/api'

async function mkDir(t: any, prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
  t.teardown(() => fs.rm(dir, { recursive: true, force: true }))
  return dir
}

test('invite: daemon B redeems a token via protomux and becomes a writer on daemon A', async (t) => {
  const testnet = await createTestnet(3, t.teardown)
  const swarm = { bootstrap: testnet.bootstrap }

  // ---- boot creator
  const aDir = await mkDir(t, 'openpact-a-')
  const a = await Daemon.create({ dataDir: aDir, swarm })
  await a.start()
  const aApi = createApi(a)
  t.teardown(() => aApi.close())
  t.teardown(() => a.stop())

  // ---- boot joiner against the same pact
  const bDir = await mkDir(t, 'openpact-b-')
  const b = await Daemon.join({ dataDir: bDir, joinKey: a.pactKey!, swarm })
  await b.start()
  const bApi = createApi(b)
  t.teardown(() => bApi.close())
  t.teardown(() => b.stop())

  await Promise.all([
    a.waitForConnections(1, { timeout: 15_000 }),
    b.waitForConnections(1, { timeout: 15_000 }),
  ])

  // A needs to post at least one entry so its implicit-indexer bootstrap
  // fires (see apply.ts INDEXER_PREFIX). Otherwise isIndexer would still
  // be false when the redeem arrives.
  await a.append({
    type: 'knowledge',
    timestamp: new Date().toISOString(),
    agent_id: a.peerHandle!,
    payload: { topic: 'bootstrap', content: 'pact is live' },
  })

  // ---- mint an invite on A
  const mintRes = await aApi.inject({
    method: 'POST',
    url: '/v1/pacts/default/invites',
    payload: { confirm: true, ttl_ms: 60_000 },
  })
  t.is(mintRes.statusCode, 200)
  const { token } = JSON.parse(mintRes.body)

  // ---- get B's writer key from /status
  const statusRes = await bApi.inject({ method: 'GET', url: '/v1/pacts/default/status' })
  t.is(statusRes.statusCode, 200)
  const status = JSON.parse(statusRes.body)
  const writerKey = status.public_key as string
  t.ok(/^[0-9a-f]{64}$/.test(writerKey))

  // ---- redeem on B's daemon — should forward to A over protomux
  const redeemRes = await bApi.inject({
    method: 'POST',
    url: '/v1/pacts/default/invites/redeem',
    payload: { token, writer_key: writerKey, confirm: true },
  })
  t.is(redeemRes.statusCode, 200, redeemRes.body)
  const redeem = JSON.parse(redeemRes.body)
  t.ok(redeem.ok)
  t.ok(typeof redeem.nonce === 'string')

  // ---- wait for the admin.addWriter to propagate so B sees itself as writer
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    const s = await bApi.inject({ method: 'GET', url: '/v1/pacts/default/status' })
    if (JSON.parse(s.body).is_writer === true) break
    await new Promise((r) => setTimeout(r, 100))
  }
  const finalStatus = await bApi.inject({ method: 'GET', url: '/v1/pacts/default/status' })
  const sb = JSON.parse(finalStatus.body)
  t.is(sb.is_writer, true, 'B should be a writer after the redeemed admin.addWriter confirms')
})

test('invite: second redeem of the same token from B returns 409 INVITE_SPENT', async (t) => {
  const testnet = await createTestnet(3, t.teardown)
  const swarm = { bootstrap: testnet.bootstrap }

  const aDir = await mkDir(t, 'openpact-a-')
  const a = await Daemon.create({ dataDir: aDir, swarm })
  await a.start()
  const aApi = createApi(a)
  t.teardown(() => aApi.close())
  t.teardown(() => a.stop())

  const bDir = await mkDir(t, 'openpact-b-')
  const b = await Daemon.join({ dataDir: bDir, joinKey: a.pactKey!, swarm })
  await b.start()
  const bApi = createApi(b)
  t.teardown(() => bApi.close())
  t.teardown(() => b.stop())

  await Promise.all([
    a.waitForConnections(1, { timeout: 15_000 }),
    b.waitForConnections(1, { timeout: 15_000 }),
  ])
  await a.append({
    type: 'knowledge',
    timestamp: new Date().toISOString(),
    agent_id: a.peerHandle!,
    payload: { topic: 'bootstrap', content: 'pact is live' },
  })

  const mintRes = await aApi.inject({
    method: 'POST',
    url: '/v1/pacts/default/invites',
    payload: { confirm: true, ttl_ms: 60_000 },
  })
  const { token } = JSON.parse(mintRes.body)
  const status = await bApi.inject({ method: 'GET', url: '/v1/pacts/default/status' })
  const writerKey = JSON.parse(status.body).public_key as string

  const first = await bApi.inject({
    method: 'POST',
    url: '/v1/pacts/default/invites/redeem',
    payload: { token, writer_key: writerKey, confirm: true },
  })
  t.is(first.statusCode, 200)

  const second = await bApi.inject({
    method: 'POST',
    url: '/v1/pacts/default/invites/redeem',
    payload: { token, writer_key: writerKey, confirm: true },
  })
  t.is(second.statusCode, 409)
  t.is(JSON.parse(second.body).error, 'INVITE_SPENT')
})
