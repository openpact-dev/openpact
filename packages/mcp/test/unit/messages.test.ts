import test from 'brittle'
import { buildServer } from '../../src/server'
import { fakePact, getRegisteredTool } from '../helpers/fake-pact'

test('read_messages: forwards since + to + limit', async (t) => {
  const pact = fakePact()
  pact.messages.list.resolveWith([])
  const server = buildServer(pact as any)
  const { handler } = getRegisteredTool(server, 'read_messages')
  await handler({ since: '2026-04-01T00:00:00Z', to: '*', limit: 50 })
  t.alike(pact.messages.list.calls[0].args, [{ since: '2026-04-01T00:00:00Z', to: '*', limit: 50 }])
})

test('send_message: forwards full payload', async (t) => {
  const pact = fakePact()
  pact.messages.send.resolveWith({ id: 'm-1', timestamp: 'T' })
  const server = buildServer(pact as any)
  const { handler } = getRegisteredTool(server, 'send_message')
  await handler({ to: '*', content: 'hello', priority: 'normal' })
  t.alike(pact.messages.send.calls[0].args, [{ to: '*', content: 'hello', priority: 'normal' }])
})
