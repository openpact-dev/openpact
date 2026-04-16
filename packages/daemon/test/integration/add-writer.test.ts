import test from 'brittle'
import { pair } from '../helpers/pair'
import type { Daemon } from '../../src/daemon'

test('creator admits B via invite; B appends; A sees B entry', async (t) => {
  const { a, b } = await pair(t)

  t.absent(b.daemon.isWriter, 'B starts as non-writer')

  const invite = await a.daemon.current!.createInvite()
  const redeemed = await b.daemon.redeemThroughPeers(
    a.daemon.pactKey!,
    invite.token,
    b.daemon.publicKey!,
    { timeoutMs: 15000 },
  )
  t.alike(redeemed, { ok: true, nonce: invite.invite.nonce })

  await b.daemon.waitForWritable({ timeout: 15000 })
  t.ok(b.daemon.isWriter, 'B is now a member')

  await a.daemon.append({
    type: 'message',
    timestamp: new Date().toISOString(),
    agent_id: a.daemon.peerHandle!,
    payload: { to: '*', content: 'creator-ready' },
  })
  await waitForMessage(b.daemon, 'creator-ready', { timeout: 15000 })

  await b.daemon.append({
    type: 'message',
    timestamp: new Date().toISOString(),
    agent_id: b.daemon.peerHandle!,
    payload: { to: '*', content: 'hello from B' },
  })

  await waitForMessage(a.daemon, 'hello from B', { timeout: 15000 })

  const stream = a.daemon.view.createReadStream({
    gte: 'message/',
    lt: 'message0',
  })
  const messages: any[] = []
  for await (const { value } of stream) messages.push(value)

  const fromB = messages.find((message) => message.payload.content === 'hello from B')
  t.ok(fromB, 'A sees B message')
  t.is(fromB.agent_id, b.daemon.peerHandle)
  t.is(fromB.payload.content, 'hello from B')
})

test('creator promotes an admitted member to indexer; B can append', async (t) => {
  const { a, b } = await pair(t)

  const invite = await a.daemon.current!.createInvite()
  const redeemed = await b.daemon.redeemThroughPeers(
    a.daemon.pactKey!,
    invite.token,
    b.daemon.publicKey!,
    { timeoutMs: 15000 },
  )
  t.alike(redeemed, { ok: true, nonce: invite.invite.nonce })
  await b.daemon.waitForWritable({ timeout: 30000 })

  await a.daemon.append({
    type: 'message',
    timestamp: new Date().toISOString(),
    agent_id: a.daemon.peerHandle!,
    payload: { to: '*', content: 'ready-for-promotion' },
  })
  await waitForMessage(b.daemon, 'ready-for-promotion', { timeout: 15000 })

  await a.daemon.addWriter(b.daemon.publicKey!, { indexer: true })
  await waitFor(() => b.daemon.isIndexer, { timeout: 30000, label: 'B to become indexer' })

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

async function waitForMessage(
  daemon: Daemon,
  content: string,
  { timeout = 10000 }: { timeout?: number } = {},
): Promise<void> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    await daemon.update()
    const stream = daemon.view.createReadStream({
      gte: 'message/',
      lt: 'message0',
    })
    for await (const { value } of stream) {
      if (value.payload.content === content) return
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`waitForMessage(${content}) timeout`)
}

async function waitFor(
  predicate: () => boolean,
  { timeout = 10000, label = 'condition' }: { timeout?: number; label?: string } = {},
): Promise<void> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`timeout waiting for ${label}`)
}
