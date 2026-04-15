import test from 'brittle'
import { OpenPact } from '../../src'
import { mockFetch } from '../helpers/mock-fetch'

test('entries.get: GETs /v1/entries/:id and returns the parsed entry', async (t) => {
  const entry = {
    id: 'a7f2-412',
    type: 'knowledge',
    timestamp: '2026-04-15T00:00:00Z',
    agent_id: 'anon-fox-1234',
    payload: { topic: 'wiring', content: 'hi' },
  }
  const m = mockFetch({ status: 200, body: entry })
  const pact = new OpenPact({ fetch: m.fetch, pactId: 'default' })
  const got = await pact.entries.get('a7f2-412')
  t.is(m.calls[0].url, 'http://127.0.0.1:7666/v1/pacts/default/entries/a7f2-412')
  t.alike(got, entry)
})

test('entries.referencedBy: GETs the referenced-by suffix', async (t) => {
  const m = mockFetch({ status: 200, body: [] })
  const pact = new OpenPact({ fetch: m.fetch, pactId: 'default' })
  await pact.entries.referencedBy('a7f2-412')
  t.is(m.calls[0].url, 'http://127.0.0.1:7666/v1/pacts/default/entries/a7f2-412/referenced-by')
})

test('entries.get: forwards 404 NotFoundError up', async (t) => {
  const m = mockFetch({
    status: 404,
    body: { error: 'NOT_FOUND', message: 'no such entry' },
  })
  const pact = new OpenPact({ fetch: m.fetch, pactId: 'default' })
  await t.exception(() => pact.entries.get('zzzz-99'))
})
