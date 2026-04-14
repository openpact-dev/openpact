import test from 'brittle'
import { pair } from '../helpers/pair'
import type { Daemon } from '../../src/daemon'

test('creator promotes B to writer; B appends; A sees B entry', async (t) => {
  const { a, b } = await pair(t)

  t.absent(b.daemon.isWriter, 'B starts as non-writer')

  await a.daemon.addWriter(b.daemon.publicKey!, { indexer: false })

  await b.daemon.waitForWritable({ timeout: 15000 })
  t.ok(b.daemon.isWriter, 'B is now a writer')

  await b.daemon.append({
    type: 'message',
    timestamp: new Date().toISOString(),
    agent_id: b.daemon.peerHandle!,
    payload: { to: '*', content: 'hello from B' },
  })

  await a.daemon.waitForViewVersion(3, { timeout: 15000 })

  const stream = a.daemon.view.createReadStream({
    gte: 'message/',
    lt: 'message0',
  })
  const messages: any[] = []
  for await (const { value } of stream) messages.push(value)

  t.is(messages.length, 1, 'A sees B message')
  t.is(messages[0].agent_id, b.daemon.peerHandle)
  t.is(messages[0].payload.content, 'hello from B')
})

test('creator promotes B as indexer; B can append', async (t) => {
  const { a, b } = await pair(t)

  await a.daemon.addWriter(b.daemon.publicKey!, { indexer: true })
  await b.daemon.waitForWritable({ timeout: 30000 })

  await b.daemon.append({
    type: 'knowledge',
    timestamp: new Date().toISOString(),
    agent_id: b.daemon.peerHandle!,
    payload: { topic: 'b-topic', content: 'B knows things' },
  })

  await waitForKnowledge(a.daemon, 'b-topic', { timeout: 30000 })

  const stream = a.daemon.view.createReadStream({
    gte: 'knowledge/',
    lt: 'knowledge0',
  })
  const entries: any[] = []
  for await (const { value } of stream) entries.push(value)
  t.is(entries.length, 1)
  t.is(entries[0].payload.topic, 'b-topic')
})

async function waitForKnowledge(
  daemon: Daemon,
  topic: string,
  { timeout = 10000 }: { timeout?: number } = {},
): Promise<void> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    await daemon.update()
    const stream = daemon.view.createReadStream({
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
