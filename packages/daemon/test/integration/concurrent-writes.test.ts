import test from 'brittle'
import { pair } from '../helpers/pair'
import type { Daemon } from '../../src/daemon'

test('two writers append concurrently; both views converge to same content', async (t) => {
  const { a, b } = await pair(t)

  await a.daemon.addWriter(b.daemon.publicKey!, { indexer: true })
  await b.daemon.waitForWritable({ timeout: 30000 })

  const aTs = '2026-04-14T10:00:00.000Z'
  const bTs = '2026-04-14T10:00:01.000Z'

  await Promise.all([
    a.daemon.append({
      type: 'knowledge',
      timestamp: aTs,
      agent_id: a.daemon.peerHandle!,
      payload: { topic: 'race', content: 'from-a' },
    }),
    b.daemon.append({
      type: 'knowledge',
      timestamp: bTs,
      agent_id: b.daemon.peerHandle!,
      payload: { topic: 'race', content: 'from-b' },
    }),
  ])

  await Promise.all([
    waitForCount(a.daemon, 2, { timeout: 30000 }),
    waitForCount(b.daemon, 2, { timeout: 30000 }),
  ])

  const aEntries = await readKnowledge(a.daemon)
  const bEntries = await readKnowledge(b.daemon)

  t.is(aEntries.length, 2, 'A sees both entries')
  t.is(bEntries.length, 2, 'B sees both entries')

  const aOrder = aEntries.map((e) => e.payload.content)
  const bOrder = bEntries.map((e) => e.payload.content)
  t.alike(aOrder, bOrder, 'same content order on both daemons')
  t.alike(aOrder, ['from-a', 'from-b'])
})

async function waitForCount(
  daemon: Daemon,
  n: number,
  { timeout = 10000 }: { timeout?: number } = {},
): Promise<void> {
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

async function readKnowledge(daemon: Daemon): Promise<any[]> {
  const stream = daemon.view.createReadStream({
    gte: 'knowledge/',
    lt: 'knowledge0',
  })
  const entries: any[] = []
  for await (const { value } of stream) entries.push(value)
  return entries
}
