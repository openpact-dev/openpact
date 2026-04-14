const test = require('brittle')
const { pair } = require('../helpers/pair')

test('two writers append concurrently; both views converge to same content', async (t) => {
  const { a, b } = await pair(t)

  // Promote B as indexer so concurrent appends both reach signedLength
  await a.daemon.addWriter(b.daemon.publicKey, { indexer: true })
  await b.daemon.waitForWritable({ timeout: 30000 })

  // Concurrent appends from both daemons
  const aTs = '2026-04-14T10:00:00.000Z'
  const bTs = '2026-04-14T10:00:01.000Z'

  await Promise.all([
    a.daemon.append({
      type: 'knowledge',
      timestamp: aTs,
      agent_id: a.daemon.peerHandle,
      payload: { topic: 'race', content: 'from-a' },
    }),
    b.daemon.append({
      type: 'knowledge',
      timestamp: bTs,
      agent_id: b.daemon.peerHandle,
      payload: { topic: 'race', content: 'from-b' },
    }),
  ])

  // Wait for both daemons to see both entries
  await Promise.all([
    waitForCount(a.daemon, 2, { timeout: 30000 }),
    waitForCount(b.daemon, 2, { timeout: 30000 }),
  ])

  // Both views should have the same content
  const aEntries = await readKnowledge(a.daemon)
  const bEntries = await readKnowledge(b.daemon)

  t.is(aEntries.length, 2, 'A sees both entries')
  t.is(bEntries.length, 2, 'B sees both entries')

  // Same ordering on both sides (deterministic via key prefix)
  const aOrder = aEntries.map((e) => e.payload.content)
  const bOrder = bEntries.map((e) => e.payload.content)
  t.alike(aOrder, bOrder, 'same content order on both daemons')
  // Timestamp-based ordering: from-a precedes from-b
  t.alike(aOrder, ['from-a', 'from-b'])
})

async function waitForCount(daemon, n, { timeout = 10000 } = {}) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    await daemon.update()
    const entries = await readKnowledge(daemon)
    if (entries.length >= n) return
    await new Promise((r) => setTimeout(r, 100))
  }
  const got = (await readKnowledge(daemon)).length
  throw new Error(`waitForCount(${n}) timeout — current ${got}`)
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
