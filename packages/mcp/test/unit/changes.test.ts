import test from 'brittle'
import { buildServer } from '../../src/server'
import { fakePact, getRegisteredTool } from '../helpers/fake-pact'

test('wait_for_changes: forwards since + wait + type + limit to pact.changes.poll', async (t) => {
  const pact = fakePact()
  pact.changes.poll.resolveWith({ entries: [], cursor: null, has_more: false })
  const server = buildServer(pact as any)
  const { handler } = getRegisteredTool(server, 'wait_for_changes')
  await handler({
    since: '2026-04-17T11:00:00.000Z|aaaa-1',
    wait: 15,
    type: 'message',
    limit: 100,
  })
  t.alike(pact.changes.poll.calls[0].args, [
    { since: '2026-04-17T11:00:00.000Z|aaaa-1', wait: 15, type: 'message', limit: 100 },
  ])
})

test('wait_for_changes: returns the poll response as JSON content', async (t) => {
  const pact = fakePact()
  pact.changes.poll.resolveWith({
    entries: [{ id: 'a-1', type: 'message', payload: { content: 'hi' } }],
    cursor: '2026-04-17T12:00:00.000Z|a-1',
    has_more: false,
  })
  const server = buildServer(pact as any)
  const { handler } = getRegisteredTool(server, 'wait_for_changes')
  const r = await handler({ wait: 0 })
  t.ok(r.content[0].text.includes('"id": "a-1"'))
  t.ok(r.content[0].text.includes('"cursor":'))
})
