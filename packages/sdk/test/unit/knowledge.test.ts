import test from 'brittle'
import { OpenPactClient } from '../../src/client'
import { knowledgeResource } from '../../src/resources/knowledge'
import { BadRequestError } from '../../src/errors'
import { mockFetch } from '../helpers/mock-fetch'

const emptyPage = { entries: [], cursor: null, has_more: false }

test('knowledge.list: builds URL with query', async (t) => {
  const m = mockFetch({ status: 200, body: emptyPage })
  const r = knowledgeResource(new OpenPactClient({ fetch: m.fetch, pactId: 'default' }))
  await r.list({ topic: 'sales', limit: 5 })
  t.is(m.calls[0].url, 'http://127.0.0.1:7666/v1/pacts/default/knowledge?topic=sales&limit=5')
})

test('knowledge.list: no opts → bare URL', async (t) => {
  const m = mockFetch({ status: 200, body: emptyPage })
  const r = knowledgeResource(new OpenPactClient({ fetch: m.fetch, pactId: 'default' }))
  await r.list()
  t.is(m.calls[0].url, 'http://127.0.0.1:7666/v1/pacts/default/knowledge')
})

test('knowledge.list: returns envelope', async (t) => {
  const m = mockFetch({
    status: 200,
    body: {
      entries: [{ id: 'a', type: 'knowledge', payload: { topic: 't', content: 'x' } }],
      cursor: 'knowledge/2026/a',
      has_more: true,
    },
  })
  const r = knowledgeResource(new OpenPactClient({ fetch: m.fetch, pactId: 'default' }))
  const page = await r.list()
  t.is(page.entries.length, 1)
  t.is(page.cursor, 'knowledge/2026/a')
  t.is(page.has_more, true)
})

test('knowledge.iterate: walks every page', async (t) => {
  const page1 = {
    entries: [{ id: 'c', payload: { topic: 't', content: 'c' } }],
    cursor: 'knowledge/c',
    has_more: true,
  }
  const page2 = {
    entries: [{ id: 'b', payload: { topic: 't', content: 'b' } }],
    cursor: 'knowledge/b',
    has_more: true,
  }
  const page3 = {
    entries: [{ id: 'a', payload: { topic: 't', content: 'a' } }],
    cursor: 'knowledge/a',
    has_more: false,
  }
  const m = mockFetch(
    { status: 200, body: page1 },
    { status: 200, body: page2 },
    { status: 200, body: page3 },
  )
  const r = knowledgeResource(new OpenPactClient({ fetch: m.fetch, pactId: 'default' }))
  const seen: string[] = []
  for await (const e of r.iterate({ limit: 1 })) {
    seen.push((e.payload as any).content)
  }
  t.alike(seen, ['c', 'b', 'a'])
  t.is(m.calls.length, 3)
  t.ok(m.calls[1].url.includes('cursor=knowledge%2Fc'))
  t.ok(m.calls[2].url.includes('cursor=knowledge%2Fb'))
})

test('knowledge.create: POSTs payload', async (t) => {
  const m = mockFetch({
    status: 200,
    body: { id: 'aaaaaaaa-1', timestamp: '2026-04-15T00:00:00Z' },
  })
  const r = knowledgeResource(new OpenPactClient({ fetch: m.fetch, pactId: 'default' }))
  const res = await r.create({ topic: 'sales', content: 'hi', confidence: 0.8 })
  t.is(res.id, 'aaaaaaaa-1')
  t.is(m.calls[0].method, 'POST')
  t.alike(JSON.parse(m.calls[0].body!), { topic: 'sales', content: 'hi', confidence: 0.8 })
})

test('knowledge.create: 400 → BadRequestError', async (t) => {
  const m = mockFetch({ status: 400, body: { error: 'BAD_REQUEST', message: 'missing topic' } })
  const r = knowledgeResource(new OpenPactClient({ fetch: m.fetch, pactId: 'default' }))
  await t.exception(() => r.create({ topic: '', content: 'x' }), BadRequestError)
})
