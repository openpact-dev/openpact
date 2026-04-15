import test from 'brittle'
import { OpenPactClient } from '../../src/client'
import { knowledgeResource } from '../../src/resources/knowledge'
import { BadRequestError } from '../../src/errors'
import { mockFetch } from '../helpers/mock-fetch'

test('knowledge.list: builds URL with query', async (t) => {
  const m = mockFetch({ status: 200, body: [] })
  const r = knowledgeResource(new OpenPactClient({ fetch: m.fetch }))
  await r.list({ topic: 'sales', limit: 5 })
  t.is(m.calls[0].url, 'http://127.0.0.1:7666/v1/knowledge?topic=sales&limit=5')
})

test('knowledge.list: no opts → bare URL', async (t) => {
  const m = mockFetch({ status: 200, body: [] })
  const r = knowledgeResource(new OpenPactClient({ fetch: m.fetch }))
  await r.list()
  t.is(m.calls[0].url, 'http://127.0.0.1:7666/v1/knowledge')
})

test('knowledge.create: POSTs payload', async (t) => {
  const m = mockFetch({ status: 200, body: { id: 'aaaa-1', timestamp: '2026-04-15T00:00:00Z' } })
  const r = knowledgeResource(new OpenPactClient({ fetch: m.fetch }))
  const res = await r.create({ topic: 'sales', content: 'hi', confidence: 0.8 })
  t.is(res.id, 'aaaa-1')
  t.is(m.calls[0].method, 'POST')
  t.alike(JSON.parse(m.calls[0].body!), { topic: 'sales', content: 'hi', confidence: 0.8 })
})

test('knowledge.create: 400 → BadRequestError', async (t) => {
  const m = mockFetch({ status: 400, body: { error: 'BAD_REQUEST', message: 'missing topic' } })
  const r = knowledgeResource(new OpenPactClient({ fetch: m.fetch }))
  await t.exception(() => r.create({ topic: '', content: 'x' }), BadRequestError)
})
