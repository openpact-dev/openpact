const test = require('brittle')
const { pair } = require('../helpers/pair')

test('creator promotes B to writer; B appends; A sees B entry', async (t) => {
  const { a, b } = await pair(t)

  // Initially, B is not a writer
  t.absent(b.daemon.isWriter, 'B starts as non-writer')

  // A promotes B
  await a.daemon.addWriter(b.daemon.publicKey, { indexer: false })

  // Wait for B's autobase to recognize itself as writable
  await b.daemon.waitForWritable({ timeout: 15000 })
  t.ok(b.daemon.isWriter, 'B is now a writer')

  // B appends an entry
  await b.daemon.append({
    type: 'message',
    timestamp: new Date().toISOString(),
    agent_id: b.daemon.peerHandle,
    payload: { to: '*', content: 'hello from B' },
  })

  // Wait for the message to land in A's view
  await a.daemon.waitForViewVersion(3, { timeout: 15000 }) // 1 indexer + 1 admin* + 1 message
  // *admin doesn't actually go in the view; counted just to be safe

  const stream = a.daemon._base.view.createReadStream({
    gte: 'message/',
    lt: 'message0',
  })
  const messages = []
  for await (const { value } of stream) messages.push(value)

  t.is(messages.length, 1, 'A sees B message')
  t.is(messages[0].agent_id, b.daemon.peerHandle)
  t.is(messages[0].payload.content, 'hello from B')
})

test('creator promotes B as indexer; B can append', async (t) => {
  const { a, b } = await pair(t)

  // A promotes B as indexer
  await a.daemon.addWriter(b.daemon.publicKey, { indexer: true })
  await b.daemon.waitForWritable({ timeout: 30000 })

  // B appends a knowledge entry
  await b.daemon.append({
    type: 'knowledge',
    timestamp: new Date().toISOString(),
    agent_id: b.daemon.peerHandle,
    payload: { topic: 'b-topic', content: 'B knows things' },
  })

  // Both daemons should converge — wait for the entry to land in A's view.
  // 2 indexers means quorum of 2 — both must ack before signedLength advances.
  await waitForKnowledge(a.daemon, 'b-topic', { timeout: 30000 })

  const stream = a.daemon._base.view.createReadStream({
    gte: 'knowledge/',
    lt: 'knowledge0',
  })
  const entries = []
  for await (const { value } of stream) entries.push(value)
  t.is(entries.length, 1)
  t.is(entries[0].payload.topic, 'b-topic')
})

async function waitForKnowledge(daemon, topic, { timeout = 10000 } = {}) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    await daemon.update()
    const stream = daemon._base.view.createReadStream({
      gte: 'knowledge/',
      lt: 'knowledge0',
    })
    for await (const { value } of stream) {
      if (value.payload.topic === topic) return
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`waitForKnowledge(${topic}) timeout`)
}
