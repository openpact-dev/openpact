import test from 'brittle'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import createTestnet from 'hyperdht/testnet'
import { Daemon } from '../../src/daemon'

test('invite admission, member removal, and reinvite gate future replication', async (t) => {
  const testnet = await createTestnet(3, t.teardown)
  const swarm = { bootstrap: testnet.bootstrap }

  const aDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openpact-a-'))
  const bDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openpact-b-'))
  t.teardown(() => fs.rm(aDir, { recursive: true, force: true }))
  t.teardown(() => fs.rm(bDir, { recursive: true, force: true }))

  const a = await Daemon.create({ dataDir: aDir, swarm })
  await a.start()
  t.teardown(() => a.stop())

  const b = await Daemon.join({ dataDir: bDir, joinKey: a.pactKey!, swarm })
  await b.start()
  t.teardown(() => b.stop())

  await Promise.all([
    a.waitForConnections(1, { timeout: 10000 }),
    b.waitForConnections(1, { timeout: 10000 }),
  ])

  const firstInvite = await a.current!.createInvite()
  const redeemed = await b.redeemThroughPeers(a.pactKey!, firstInvite.token, b.publicKey!, {
    timeoutMs: 15000,
  })
  t.alike(redeemed, { ok: true, nonce: firstInvite.invite.nonce })

  await b.waitForWritable({ timeout: 15000 })
  t.ok(b.isMember, 'B becomes a member after redeeming the invite')

  const beforeVisibleVersion = b.viewVersion
  await a.append(entry(a, 'before-removal', 'visible to B'))
  await b.waitForViewVersion(beforeVisibleVersion + 1, { timeout: 15000 })
  await waitForKnowledgeContent(b, 'visible to B', { timeout: 5000 })

  await a.removeWriter(b.publicKey!)
  await waitFor(() => !b.isMember, { timeout: 15000, label: 'B to lose membership' })

  const removedVersion = b.viewVersion
  await a.append(entry(a, 'after-removal', 'should stay hidden'))
  await new Promise((r) => setTimeout(r, 3000))
  t.is(b.viewVersion, removedVersion, 'B view does not advance after removal')
  await assertKnowledgeMissing(b, 'should stay hidden', { timeout: 3000 })

  await b.waitForConnections(1, { timeout: 10000 })

  const secondInvite = await a.current!.createInvite()
  const rereemed = await b.redeemThroughPeers(a.pactKey!, secondInvite.token, b.publicKey!, {
    timeoutMs: 15000,
  })
  t.alike(rereemed, { ok: true, nonce: secondInvite.invite.nonce })

  await b.waitForWritable({ timeout: 15000 })
  t.ok(b.isMember, 'B can be re-invited with the same member key')

  const beforeVisibleAgainVersion = b.viewVersion
  await a.append(entry(a, 'after-reinvite', 'visible again'))
  await b.waitForViewVersion(beforeVisibleAgainVersion + 1, { timeout: 15000 })
  await waitForKnowledgeContent(b, 'visible again', { timeout: 5000 })
})

function entry(daemon: Daemon, topic: string, content: string) {
  return {
    type: 'knowledge',
    timestamp: new Date().toISOString(),
    agent_id: daemon.peerHandle!,
    payload: { topic, content },
  }
}

async function waitForKnowledgeContent(
  daemon: Daemon,
  content: string,
  { timeout = 10000 }: { timeout?: number } = {},
): Promise<void> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const entries = await readKnowledge(daemon)
    if (entries.some((e) => e.payload.content === content)) return
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`waitForKnowledgeContent(${content}) timeout`)
}

async function assertKnowledgeMissing(
  daemon: Daemon,
  content: string,
  { timeout = 2000 }: { timeout?: number } = {},
): Promise<void> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const entries = await readKnowledge(daemon)
    if (entries.some((e) => e.payload.content === content)) {
      throw new Error(`unexpectedly replicated knowledge content: ${content}`)
    }
    await new Promise((r) => setTimeout(r, 100))
  }
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

async function waitFor(
  predicate: () => boolean,
  { timeout = 5000, label = 'condition' }: { timeout?: number; label?: string } = {},
): Promise<void> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`timeout waiting for ${label}`)
}
