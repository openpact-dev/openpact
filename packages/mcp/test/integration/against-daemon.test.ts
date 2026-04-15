/**
 * Boot a real OpenPact daemon on an ephemeral port, spin up our MCP
 * server in-process, wire an MCP Client to it via InMemoryTransport,
 * and round-trip every major tool. Catches drift between the SDK and
 * the daemon's REST surface that a mocked-fetch unit test would miss.
 */
import test from 'brittle'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { Daemon, createApi, bind } from '@openpact/daemon'
import { OpenPact } from '@openpact/sdk'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { buildServer } from '../../src/server'

let nextPort = 19900

interface Env {
  client: Client
  pact: OpenPact
}

async function bootMcpAgainstDaemon(t: any): Promise<Env> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openpact-mcp-'))
  const daemon = await Daemon.create({ dataDir: dir })
  await daemon.start()
  const app = createApi(daemon)
  const port = nextPort++
  await bind(app, { host: '127.0.0.1', port })

  const pact = new OpenPact({ port })
  const server = buildServer(pact, { name: 'openpact-test', version: '0.0.0' })

  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)

  const client = new Client({ name: 'test-client', version: '0.0.0' })
  await client.connect(clientTransport)

  t.teardown(async () => {
    await client.close()
    await server.close()
    await app.close()
    await daemon.stop()
    await fs.rm(dir, { recursive: true, force: true })
  })

  return { client, pact }
}

async function callTool(client: Client, name: string, args: Record<string, unknown> = {}) {
  return client.callTool({ name, arguments: args })
}

function textOf(result: any): string {
  const c = result.content?.[0]
  if (!c || c.type !== 'text') throw new Error('expected text content')
  return c.text
}

async function waitFor<T>(
  fn: () => Promise<T>,
  ok: (v: T) => boolean,
  timeoutMs = 3000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs
  let last: T
  while (Date.now() < deadline) {
    last = await fn()
    if (ok(last)) return last
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error('waitFor timeout; last value: ' + JSON.stringify(last!))
}

test('MCP end-to-end: ping and pact_status against a real daemon', async (t) => {
  const { client } = await bootMcpAgainstDaemon(t)
  const ping = await callTool(client, 'ping')
  t.alike(JSON.parse(textOf(ping)), { ok: true })
  const status = await callTool(client, 'pact_status')
  const parsed = JSON.parse(textOf(status))
  t.is(parsed.role, 'creator')
  t.is(parsed.is_writer, true)
})

test('MCP end-to-end: record_knowledge then recall_knowledge round-trips', async (t) => {
  const { client } = await bootMcpAgainstDaemon(t)
  const created = await callTool(client, 'record_knowledge', {
    topic: 'routing',
    content: 'use the resolver factory',
  })
  const summary = textOf(created)
  t.ok(/^Recorded knowledge entry [0-9a-f]{4}-\d+/.test(summary))

  const list = await waitFor(
    async () => {
      const r = await callTool(client, 'recall_knowledge', { topic: 'routing' })
      return JSON.parse(textOf(r)) as any[]
    },
    (arr) => Array.isArray(arr) && arr.length >= 1,
  )
  t.is(list[0].payload.content, 'use the resolver factory')
})

test('MCP end-to-end: tasks lifecycle (create → claim → complete)', async (t) => {
  const { client } = await bootMcpAgainstDaemon(t)
  const created = await callTool(client, 'create_task', { title: 'do the thing' })
  const id = (JSON.parse(textOf(created).split('\n\n')[1]) as { id: string }).id

  await waitFor(
    async () => JSON.parse(textOf(await callTool(client, 'list_tasks', { status: 'open' }))),
    (arr: any[]) => arr.some((tt) => tt.id === id),
  )
  const claimed = await callTool(client, 'claim_task', { id })
  t.ok(textOf(claimed).startsWith(`Claimed task ${id}.`))

  const completed = await callTool(client, 'complete_task', { id, result: 'shipped' })
  t.ok(textOf(completed).startsWith(`Completed task ${id}.`))
})

test('MCP end-to-end: claiming the same task twice surfaces TASK_NOT_OPEN with isError', async (t) => {
  const { client } = await bootMcpAgainstDaemon(t)
  const created = await callTool(client, 'create_task', { title: 'once' })
  const id = (JSON.parse(textOf(created).split('\n\n')[1]) as { id: string }).id
  await waitFor(
    async () => JSON.parse(textOf(await callTool(client, 'list_tasks', { status: 'open' }))),
    (arr: any[]) => arr.some((tt) => tt.id === id),
  )
  await callTool(client, 'claim_task', { id })
  const second: any = await callTool(client, 'claim_task', { id })
  t.is(second.isError, true)
  t.ok(textOf(second).startsWith('TASK_NOT_OPEN: '))
})

test('MCP end-to-end: messages send + read with since cursor', async (t) => {
  const { client } = await bootMcpAgainstDaemon(t)
  await callTool(client, 'send_message', { to: '*', content: 'first' })
  await new Promise((r) => setTimeout(r, 5))
  const cutoff = new Date().toISOString()
  await new Promise((r) => setTimeout(r, 5))
  await callTool(client, 'send_message', { to: '*', content: 'second' })
  const recent = await waitFor(
    async () => {
      const r = await callTool(client, 'read_messages', { since: cutoff })
      return JSON.parse(textOf(r)) as any[]
    },
    (arr) => arr.length >= 1,
  )
  t.is(recent[0].payload.content, 'second')
})

test('MCP end-to-end: list_peers returns an empty array on a solo daemon', async (t) => {
  const { client } = await bootMcpAgainstDaemon(t)
  const r = await callTool(client, 'list_peers')
  t.alike(JSON.parse(textOf(r)), [])
})
