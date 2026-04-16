import test from 'brittle'
import { buildServer } from '../../src/server'
import { fakePact, getRegisteredTool } from '../helpers/fake-pact'

test('recall_knowledge: forwards topic + limit to pact.knowledge.list', async (t) => {
  const pact = fakePact()
  pact.knowledge.list.resolveWith([{ id: 'a-1', payload: { topic: 'routing', content: 'x' } }])
  const server = buildServer(pact as any)
  const { handler } = getRegisteredTool(server, 'recall_knowledge')
  const r = await handler({ topic: 'routing', limit: 5 })
  t.alike(pact.knowledge.list.calls[0].args, [
    { topic: 'routing', order: undefined, limit: 5, cursor: undefined },
  ])
  t.ok(r.content[0].text.includes('"topic": "routing"'))
})

test('record_knowledge: forwards full payload and prefixes a summary', async (t) => {
  const pact = fakePact()
  pact.knowledge.create.resolveWith({ id: 'a7f2bcde-412', timestamp: '2026-04-15T19:30:00Z' })
  const server = buildServer(pact as any)
  const { handler } = getRegisteredTool(server, 'record_knowledge')
  const r = await handler({
    topic: 'routing',
    content: 'Use the resolver factory.',
    confidence: 0.9,
  })
  t.alike(pact.knowledge.create.calls[0].args, [
    { topic: 'routing', content: 'Use the resolver factory.', confidence: 0.9 },
  ])
  t.ok(
    r.content[0].text.startsWith('Recorded knowledge entry a7f2bcde-412 at 2026-04-15T19:30:00Z.'),
  )
})
