import test from 'brittle'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import createTestnet from 'hyperdht/testnet'
import { Daemon } from '../../src/daemon'

test('B goes offline; A appends; B comes back and catches up', async (t) => {
  const testnet = await createTestnet(3, t.teardown)
  const swarm = { bootstrap: testnet.bootstrap }

  const aDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openpact-a-'))
  const bDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openpact-b-'))
  t.teardown(() => fs.rm(aDir, { recursive: true, force: true }))
  t.teardown(() => fs.rm(bDir, { recursive: true, force: true }))

  const a = await Daemon.create({ dataDir: aDir, swarm })
  await a.start()
  t.teardown(() => a.stop())

  let b = await Daemon.join({ dataDir: bDir, joinKey: a.pactKey!, swarm })
  await b.start()
  await Promise.all([
    a.waitForConnections(1, { timeout: 10000 }),
    b.waitForConnections(1, { timeout: 10000 }),
  ])
  await admitMember(a, b)

  await a.append({
    type: 'knowledge',
    timestamp: '2026-04-14T10:00:00.000Z',
    agent_id: a.peerHandle!,
    payload: { topic: 'before', content: 'X' },
  })

  await waitForKnowledgeContent(b, 'X', { timeout: 15000 })

  await b.stop()

  await a.append({
    type: 'knowledge',
    timestamp: '2026-04-14T10:00:01.000Z',
    agent_id: a.peerHandle!,
    payload: { topic: 'after', content: 'Y' },
  })

  b = await Daemon.load({ dataDir: bDir, swarm })
  await b.start()
  t.teardown(() => b.stop())
  await b.waitForConnections(1, { timeout: 10000 })

  await waitForKnowledgeContent(b, 'Y', { timeout: 15000 })

  const entries = await readKnowledge(b)
  const contents = entries.map((e) => e.payload.content).sort()
  t.alike(contents, ['X', 'Y'], 'B has caught up with both entries')
})

async function admitMember(a: Daemon, b: Daemon): Promise<void> {
  const invite = await a.current!.createInvite()
  const redeemed = await b.redeemThroughPeers(a.pactKey!, invite.token, b.publicKey!, {
    timeoutMs: 15000,
  })
  if (!redeemed.ok) throw new Error(`failed to redeem invite: ${JSON.stringify(redeemed)}`)
  await b.waitForWritable({ timeout: 15000 })
}

async function waitForKnowledgeContent(
  daemon: Daemon,
  content: string,
  { timeout = 10000 }: { timeout?: number } = {},
): Promise<void> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    await daemon.update()
    const entries = await readKnowledge(daemon)
    if (entries.some((e) => e.payload.content === content)) return
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`waitForKnowledgeContent(${content}) timeout`)
}

async function readKnowledge(daemon: Daemon): Promise<any[]> {
  const stream = daemon.view.createReadStream({
    gte: 'knowledge/',
    lt: 'knowledge0',
  })
  const entries: any[] = []
  for await (const { value } of stream) entries.push(value)
  return entries
}
