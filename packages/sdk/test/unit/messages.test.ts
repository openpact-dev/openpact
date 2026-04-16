import test from 'brittle'
import { OpenPactClient } from '../../src/client'
import { messagesResource } from '../../src/resources/messages'
import { mockFetch } from '../helpers/mock-fetch'

const emptyPage = { entries: [], cursor: null, has_more: false }

test('messages.list: builds query with since', async (t) => {
  const m = mockFetch({ status: 200, body: emptyPage })
  const r = messagesResource(new OpenPactClient({ fetch: m.fetch, pactId: 'default' }))
  await r.list({ since: '2026-04-15T00:00:00Z' })
  t.ok(m.calls[0].url.includes('since=2026-04-15T00%3A00%3A00Z'))
})

test('messages.list: returns envelope', async (t) => {
  const m = mockFetch({
    status: 200,
    body: {
      entries: [{ id: 'a', type: 'message', payload: { content: 'hi' } }],
      cursor: 'message/2026/a',
      has_more: false,
    },
  })
  const r = messagesResource(new OpenPactClient({ fetch: m.fetch, pactId: 'default' }))
  const page = await r.list()
  t.is(page.entries.length, 1)
  t.is(page.cursor, 'message/2026/a')
  t.is(page.has_more, false)
})

test('messages.iterate: paginates across pages', async (t) => {
  const m = mockFetch(
    {
      status: 200,
      body: {
        entries: [{ id: 'b', payload: { content: 'second' } }],
        cursor: 'message/b',
        has_more: true,
      },
    },
    {
      status: 200,
      body: {
        entries: [{ id: 'a', payload: { content: 'first' } }],
        cursor: 'message/a',
        has_more: false,
      },
    },
  )
  const r = messagesResource(new OpenPactClient({ fetch: m.fetch, pactId: 'default' }))
  const seen: string[] = []
  for await (const e of r.iterate({ limit: 1 })) seen.push((e.payload as any).content)
  t.alike(seen, ['second', 'first'])
})

test('messages.send: broadcast', async (t) => {
  const m = mockFetch({ status: 200, body: { id: 'aaaaaaaa-1', timestamp: 'now' } })
  const r = messagesResource(new OpenPactClient({ fetch: m.fetch, pactId: 'default' }))
  await r.send({ content: 'heads up' })
  const body = JSON.parse(m.calls[0].body!)
  t.is(body.content, 'heads up')
})
