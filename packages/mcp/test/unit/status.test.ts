import test from 'brittle'
import { buildServer } from '../../src/server'
import { fakePact, getRegisteredTool } from '../helpers/fake-pact'

test('ping: calls pact.ping() and returns the JSON', async (t) => {
  const pact = fakePact()
  pact.ping.resolveWith({ ok: true })
  const server = buildServer(pact as any)
  const { handler } = getRegisteredTool(server, 'ping')
  const r = await handler({})
  t.is(pact.ping.calls.length, 1)
  t.is(r.content[0].text, '{\n  "ok": true\n}')
})

test('pact_status: calls pact.status() and returns the JSON', async (t) => {
  const pact = fakePact()
  pact.status.resolveWith({ pact_id: 'abc', role: 'creator' })
  const server = buildServer(pact as any)
  const { handler } = getRegisteredTool(server, 'pact_status')
  const r = await handler({})
  t.is(pact.status.calls.length, 1)
  t.ok(r.content[0].text.includes('"pact_id": "abc"'))
})

test('list_agents: calls pact.agents() and returns the JSON array', async (t) => {
  const pact = fakePact()
  pact.agents.resolveWith([{ id: 'anon-fox-12345678', remote_key: 'k', online: true }])
  const server = buildServer(pact as any)
  const { handler } = getRegisteredTool(server, 'list_agents')
  const r = await handler({})
  t.is(pact.agents.calls.length, 1)
  t.ok(r.content[0].text.includes('"id": "anon-fox-12345678"'))
})

test('SDK errors surface as isError: true with the code prefix', async (t) => {
  const pact = fakePact()
  pact.ping.rejectWith(Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }))
  const server = buildServer(pact as any)
  const { handler } = getRegisteredTool(server, 'ping')
  const r = await handler({})
  t.is(r.isError, true)
  t.ok(r.content[0].text.includes('refused'))
})
