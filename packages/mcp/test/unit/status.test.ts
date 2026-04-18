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

test('list_pacts: calls pact.pacts.list() and returns the JSON', async (t) => {
  const pact = fakePact()
  pact.pacts.list.resolveWith({
    current: 'qr',
    pacts: [{ alias: 'qr', pact_id: 'abc', is_current: true }],
  })
  const server = buildServer(pact as any)
  const { handler } = getRegisteredTool(server, 'list_pacts')
  const r = await handler({})
  t.is(pact.pacts.list.calls.length, 1)
  t.ok(r.content[0].text.includes('"current": "qr"'))
})

test('switch_pact: retargets the client at the matched alias', async (t) => {
  const pact = fakePact()
  pact.pacts.list.resolveWith({
    current: 'qr',
    pacts: [
      { alias: 'qr', pact_id: 'aaaa', is_current: true },
      { alias: 'other', pact_id: 'bbbb', is_current: false },
    ],
  })
  const server = buildServer(pact as any)
  const { handler } = getRegisteredTool(server, 'switch_pact')
  const r = await handler({ pactId: 'other' })
  t.is(pact.pactId, 'other', 'client retargeted to new alias')
  t.absent(r.isError, 'successful switch is not an error')
  t.ok(r.content[0].text.includes('switched to other'))
})

test('switch_pact: accepts a 64-hex pact_id in addition to alias', async (t) => {
  const pact = fakePact()
  pact.pacts.list.resolveWith({
    current: 'qr',
    pacts: [
      { alias: 'qr', pact_id: 'aaaa', is_current: true },
      { alias: 'other', pact_id: 'bbbb', is_current: false },
    ],
  })
  const server = buildServer(pact as any)
  const { handler } = getRegisteredTool(server, 'switch_pact')
  const r = await handler({ pactId: 'bbbb' })
  t.is(pact.pactId, 'other', 'resolved pact_id to its alias')
  t.absent(r.isError)
})

test('switch_pact: errors on unknown alias without mutating state', async (t) => {
  const pact = fakePact()
  pact.pactId = 'qr'
  pact.pacts.list.resolveWith({
    current: 'qr',
    pacts: [{ alias: 'qr', pact_id: 'aaaa', is_current: true }],
  })
  const server = buildServer(pact as any)
  const { handler } = getRegisteredTool(server, 'switch_pact')
  const r = await handler({ pactId: 'does-not-exist' })
  t.is(r.isError, true, 'unknown pact is an error')
  t.ok(r.content[0].text.includes('NO_SUCH_PACT'))
  t.is(pact.pactId, 'qr', 'unchanged when the switch fails')
})
