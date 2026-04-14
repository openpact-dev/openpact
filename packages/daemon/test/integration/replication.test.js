const test = require('brittle')
const { pair } = require('../helpers/pair')

test('A appends knowledge, B sees it via replication', async (t) => {
  const { a, b } = await pair(t)

  await a.daemon.append({
    type: 'knowledge',
    timestamp: new Date().toISOString(),
    agent_id: a.daemon.peerHandle,
    payload: { topic: 'sales', content: 'Tuesdays convert better' },
  })

  // Wait for B's view to reflect both the bootstrap indexer entry and the knowledge entry.
  await b.daemon.waitForViewVersion(2, { timeout: 15000 })

  // Verify B can read the entry from its view.
  const stream = b.daemon._base.view.createReadStream({
    gte: 'knowledge/',
    lt: 'knowledge0',
  })
  const entries = []
  for await (const { value } of stream) entries.push(value)

  t.is(entries.length, 1, 'B sees exactly one knowledge entry')
  t.is(entries[0].payload.topic, 'sales')
  t.is(entries[0].payload.content, 'Tuesdays convert better')
  t.is(entries[0].agent_id, a.daemon.peerHandle)
})

test('A appends multiple entries, B sees them all in order', async (t) => {
  const { a, b } = await pair(t)

  for (let i = 0; i < 3; i++) {
    await a.daemon.append({
      type: 'knowledge',
      timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
      agent_id: a.daemon.peerHandle,
      payload: { topic: 'count', content: `entry-${i}` },
    })
  }

  // 1 bootstrap _indexers entry + 3 knowledge entries
  await b.daemon.waitForViewVersion(4, { timeout: 15000 })

  const stream = b.daemon._base.view.createReadStream({
    gte: 'knowledge/',
    lt: 'knowledge0',
  })
  const contents = []
  for await (const { value } of stream) contents.push(value.payload.content)
  t.alike(contents, ['entry-0', 'entry-1', 'entry-2'])
})
