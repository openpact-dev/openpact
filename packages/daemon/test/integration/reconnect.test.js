const test = require('brittle')
const fs = require('fs/promises')
const os = require('os')
const path = require('path')
const createTestnet = require('hyperdht/testnet')
const { Daemon } = require('../../src/daemon')

test('B goes offline; A appends; B comes back and catches up', async (t) => {
  const testnet = await createTestnet(3, t.teardown)
  const swarm = { bootstrap: testnet.bootstrap }

  const aDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openpact-a-'))
  const bDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openpact-b-'))
  t.teardown(() => fs.rm(aDir, { recursive: true, force: true }))
  t.teardown(() => fs.rm(bDir, { recursive: true, force: true }))

  // A creates the pact, starts
  const a = await Daemon.create({ dataDir: aDir, swarm })
  await a.start()
  t.teardown(() => a.stop())

  // B joins, starts
  let b = await Daemon.join({ dataDir: bDir, joinKey: a.pactKey, swarm })
  await b.start()
  await Promise.all([
    a.waitForConnections(1, { timeout: 10000 }),
    b.waitForConnections(1, { timeout: 10000 }),
  ])

  // A appends entry X
  await a.append({
    type: 'knowledge',
    timestamp: '2026-04-14T10:00:00.000Z',
    agent_id: a.peerHandle,
    payload: { topic: 'before', content: 'X' },
  })

  // B sees X
  await waitForKnowledgeContent(b, 'X', { timeout: 15000 })

  // B goes offline
  await b.stop()

  // A appends entry Y while B is offline
  await a.append({
    type: 'knowledge',
    timestamp: '2026-04-14T10:00:01.000Z',
    agent_id: a.peerHandle,
    payload: { topic: 'after', content: 'Y' },
  })

  // B comes back online (Daemon.load same dir)
  b = await Daemon.load({ dataDir: bDir, swarm })
  await b.start()
  t.teardown(() => b.stop())
  await b.waitForConnections(1, { timeout: 10000 })

  // B catches up — should see both X and Y
  await waitForKnowledgeContent(b, 'Y', { timeout: 15000 })

  const entries = await readKnowledge(b)
  const contents = entries.map((e) => e.payload.content).sort()
  t.alike(contents, ['X', 'Y'], 'B has caught up with both entries')
})

async function waitForKnowledgeContent(daemon, content, { timeout = 10000 } = {}) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    await daemon.update()
    const entries = await readKnowledge(daemon)
    if (entries.some((e) => e.payload.content === content)) return
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`waitForKnowledgeContent(${content}) timeout`)
}

async function readKnowledge(daemon) {
  const stream = daemon._base.view.createReadStream({
    gte: 'knowledge/',
    lt: 'knowledge0',
  })
  const entries = []
  for await (const { value } of stream) entries.push(value)
  return entries
}
