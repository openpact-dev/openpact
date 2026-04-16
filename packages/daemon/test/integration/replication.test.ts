import test from 'brittle'
import { pair } from '../helpers/pair'
import type { Daemon } from '../../src/daemon'

test('A appends knowledge, B sees it via replication', async (t) => {
  const { a, b } = await pair(t)
  await admitMember(a.daemon, b.daemon)

  await a.daemon.append({
    type: 'knowledge',
    timestamp: new Date().toISOString(),
    agent_id: a.daemon.peerHandle!,
    payload: { topic: 'sales', content: 'Tuesdays convert better' },
  })

  await waitForKnowledgeContent(b.daemon, 'Tuesdays convert better', { timeout: 15000 })

  const stream = b.daemon.view.createReadStream({
    gte: 'knowledge/',
    lt: 'knowledge0',
  })
  const entries: any[] = []
  for await (const { value } of stream) entries.push(value)

  t.is(entries.length, 1, 'B sees exactly one knowledge entry')
  t.is(entries[0].payload.topic, 'sales')
  t.is(entries[0].payload.content, 'Tuesdays convert better')
  t.is(entries[0].agent_id, a.daemon.peerHandle)
})

test('A appends multiple entries, B sees them all in order', async (t) => {
  const { a, b } = await pair(t)
  await admitMember(a.daemon, b.daemon)

  for (let i = 0; i < 3; i++) {
    await a.daemon.append({
      type: 'knowledge',
      timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
      agent_id: a.daemon.peerHandle!,
      payload: { topic: 'count', content: `entry-${i}` },
    })
  }

  await waitForKnowledgeCount(b.daemon, 3, { timeout: 15000 })

  const stream = b.daemon.view.createReadStream({
    gte: 'knowledge/',
    lt: 'knowledge0',
  })
  const contents: string[] = []
  for await (const { value } of stream) contents.push(value.payload.content)
  t.alike(contents, ['entry-0', 'entry-1', 'entry-2'])
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
    if (entries.some((entry) => entry.payload.content === content)) return
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`waitForKnowledgeContent(${content}) timeout`)
}

async function waitForKnowledgeCount(
  daemon: Daemon,
  count: number,
  { timeout = 10000 }: { timeout?: number } = {},
): Promise<void> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    await daemon.update()
    const entries = await readKnowledge(daemon)
    if (entries.length >= count) return
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`waitForKnowledgeCount(${count}) timeout`)
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
