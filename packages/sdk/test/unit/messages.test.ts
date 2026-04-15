import test from 'brittle'
import { OpenPactClient } from '../../src/client'
import { messagesResource } from '../../src/resources/messages'
import { mockFetch } from '../helpers/mock-fetch'

test('messages.list: builds query with since + to', async (t) => {
  const m = mockFetch({ status: 200, body: [] })
  const r = messagesResource(new OpenPactClient({ fetch: m.fetch }))
  await r.list({ since: '2026-04-15T00:00:00Z', to: '*' })
  t.ok(m.calls[0].url.includes('since=2026-04-15T00%3A00%3A00Z'))
  t.ok(m.calls[0].url.includes('to=*'), 'URLSearchParams leaves * as-is')
})

test('messages.send: broadcast', async (t) => {
  const m = mockFetch({ status: 200, body: { id: 'aaaa-1', timestamp: 'now' } })
  const r = messagesResource(new OpenPactClient({ fetch: m.fetch }))
  await r.send({ to: '*', content: 'heads up' })
  const body = JSON.parse(m.calls[0].body!)
  t.is(body.to, '*')
  t.is(body.content, 'heads up')
})

test('messages.send: direct to handle', async (t) => {
  const m = mockFetch({ status: 200, body: { id: 'aaaa-1', timestamp: 'now' } })
  const r = messagesResource(new OpenPactClient({ fetch: m.fetch }))
  await r.send({ to: 'anon-fox-1234', content: 'private' })
  t.is(JSON.parse(m.calls[0].body!).to, 'anon-fox-1234')
})
