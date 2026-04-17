import test from 'brittle'
import { OpenPactClient } from '../../src/client'
import { changesResource } from '../../src/resources/changes'
import { BadCursorError } from '../../src/errors'
import { mockFetch } from '../helpers/mock-fetch'

const emptyPage = { entries: [], cursor: null, has_more: false }

function ent(id: string, type: 'knowledge' | 'message' = 'knowledge') {
  return {
    id,
    type,
    timestamp: `2026-04-17T11:00:${id.padStart(2, '0')}.000Z`,
    agent_id: 'anon-test-00000000',
    payload: { topic: 'x', content: id },
  }
}

test('changes.poll: no opts → bare URL', async (t) => {
  const m = mockFetch({ status: 200, body: emptyPage })
  const r = changesResource(new OpenPactClient({ fetch: m.fetch, pactId: 'default' }))
  await r.poll()
  t.is(m.calls[0].url, 'http://127.0.0.1:7666/v1/pacts/default/changes')
})

test('changes.poll: forwards since + wait + limit + type as query params', async (t) => {
  const m = mockFetch({ status: 200, body: emptyPage })
  const r = changesResource(new OpenPactClient({ fetch: m.fetch, pactId: 'default' }))
  await r.poll({ since: '2026-04-17T10:00:00.000Z|aaaa-1', wait: 15, limit: 20, type: 'task' })
  const url = new URL(m.calls[0].url)
  t.is(url.searchParams.get('since'), '2026-04-17T10:00:00.000Z|aaaa-1')
  t.is(url.searchParams.get('wait'), '15')
  t.is(url.searchParams.get('limit'), '20')
  t.is(url.searchParams.get('type'), 'task')
})

test('changes.poll: parses response envelope', async (t) => {
  const m = mockFetch({
    status: 200,
    body: {
      entries: [ent('1'), ent('2', 'message')],
      cursor: '2026-04-17T11:00:02.000Z|2',
      has_more: false,
    },
  })
  const r = changesResource(new OpenPactClient({ fetch: m.fetch, pactId: 'default' }))
  const page = await r.poll()
  t.is(page.entries.length, 2)
  t.is(page.cursor, '2026-04-17T11:00:02.000Z|2')
  t.is(page.has_more, false)
})

test('changes.poll: 400 BAD_CURSOR surfaces as BadCursorError', async (t) => {
  const m = mockFetch({
    status: 400,
    body: { error: 'BAD_CURSOR', message: 'malformed', status: 400 },
  })
  const r = changesResource(new OpenPactClient({ fetch: m.fetch, pactId: 'default' }))
  await t.exception(() => r.poll({ since: 'garbage' }), BadCursorError)
})

test('changes.stream: bootstrap pages wait=0, tail poll uses waitSeconds', async (t) => {
  // Page 1: has_more=true keeps bootstrap mode.
  // Page 2: has_more=false, last bootstrap yield.
  // Page 3: network error ends the stream cleanly so the test doesn't hang.
  const m = mockFetch(
    { status: 200, body: { entries: [ent('1')], cursor: 'c1', has_more: true } },
    { status: 200, body: { entries: [ent('2')], cursor: 'c2', has_more: false } },
    { networkError: new Error('deliberate stop') },
  )
  const r = changesResource(new OpenPactClient({ fetch: m.fetch, pactId: 'default' }))
  const yielded: string[][] = []
  await t.exception(async () => {
    for await (const page of r.stream({ waitSeconds: 5 })) {
      yielded.push(page.entries.map((e: any) => e.id))
    }
  })

  t.alike(yielded, [['1'], ['2']])
  const waits = m.calls.map((c) => new URL(c.url).searchParams.get('wait'))
  t.is(waits[0], '0', 'first bootstrap call sends wait=0')
  t.is(waits[1], '0', 'still bootstrapping after a has_more=true page')
  t.is(waits[2], '5', 'tail call uses waitSeconds')
})
