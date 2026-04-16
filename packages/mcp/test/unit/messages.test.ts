import test from 'brittle'
import { buildServer } from '../../src/server'
import { fakePact, getRegisteredTool } from '../helpers/fake-pact'

test('read_messages: forwards since + limit', async (t) => {
  const pact = fakePact()
  pact.messages.list.resolveWith([])
  const server = buildServer(pact as any)
  const { handler } = getRegisteredTool(server, 'read_messages')
  await handler({ since: '2026-04-01T00:00:00Z', limit: 50 })
  t.alike(pact.messages.list.calls[0].args, [
    { since: '2026-04-01T00:00:00Z', order: undefined, limit: 50, cursor: undefined },
  ])
})

test('send_message: forwards full payload', async (t) => {
  const pact = fakePact()
  pact.messages.send.resolveWith({ id: 'm-1', timestamp: 'T' })
  const server = buildServer(pact as any)
  const { handler } = getRegisteredTool(server, 'send_message')
  await handler({ content: 'hello', priority: 'normal' })
  t.alike(pact.messages.send.calls[0].args, [{ content: 'hello', priority: 'normal' }])
})
