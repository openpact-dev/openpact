import test from 'brittle'
import { OpenPactClient } from '../../src/client'
import { adminResource } from '../../src/resources/admin'
import { NotAWriterError } from '../../src/errors'
import { mockFetch } from '../helpers/mock-fetch'

const KEY = 'a'.repeat(64)

test('admin.addWriter: POST writer (default)', async (t) => {
  const m = mockFetch({ status: 200, body: { ok: true, key: KEY, indexer: false } })
  const r = adminResource(new OpenPactClient({ fetch: m.fetch, pactId: 'default' }))
  const res = await r.addWriter(KEY)
  t.is(res.indexer, false)
  t.is(m.calls[0].method, 'POST')
  t.is(m.calls[0].url, 'http://127.0.0.1:7666/v1/pacts/default/admin/writers')
  t.alike(JSON.parse(m.calls[0].body!), { key: KEY, indexer: false })
})

test('admin.addWriter: --indexer flag honoured', async (t) => {
  const m = mockFetch({ status: 200, body: { ok: true, key: KEY, indexer: true } })
  const r = adminResource(new OpenPactClient({ fetch: m.fetch, pactId: 'default' }))
  await r.addWriter(KEY, { indexer: true })
  t.is(JSON.parse(m.calls[0].body!).indexer, true)
})

test('admin.removeWriter: DELETE with key in path', async (t) => {
  const m = mockFetch({ status: 200, body: { ok: true, key: KEY } })
  const r = adminResource(new OpenPactClient({ fetch: m.fetch, pactId: 'default' }))
  await r.removeWriter(KEY)
  t.is(m.calls[0].method, 'DELETE')
  t.is(m.calls[0].url, `http://127.0.0.1:7666/v1/pacts/default/admin/writers/${KEY}`)
})

test('admin.addWriter: 409 NOT_A_WRITER → NotAWriterError', async (t) => {
  const m = mockFetch({
    status: 409,
    body: { error: 'NOT_A_WRITER', message: 'this daemon is not a writer' },
  })
  const r = adminResource(new OpenPactClient({ fetch: m.fetch, pactId: 'default' }))
  await t.exception(() => r.addWriter(KEY), NotAWriterError)
})
