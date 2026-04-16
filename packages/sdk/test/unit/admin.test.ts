import test from 'brittle'
import { OpenPactClient } from '../../src/client'
import { adminResource } from '../../src/resources/admin'
import { NotAMemberError } from '../../src/errors'
import { mockFetch } from '../helpers/mock-fetch'

const KEY = 'a'.repeat(64)

test('admin.addMember: POST member (default)', async (t) => {
  const m = mockFetch({ status: 200, body: { ok: true, key: KEY, indexer: false } })
  const r = adminResource(new OpenPactClient({ fetch: m.fetch, pactId: 'default' }))
  const res = await r.addMember(KEY)
  t.is(res.indexer, false)
  t.is(m.calls[0].method, 'POST')
  t.is(m.calls[0].url, 'http://127.0.0.1:7666/v1/pacts/default/admin/members')
  t.alike(JSON.parse(m.calls[0].body!), { key: KEY, indexer: false })
})

test('admin.addMember: --indexer flag honoured', async (t) => {
  const m = mockFetch({ status: 200, body: { ok: true, key: KEY, indexer: true } })
  const r = adminResource(new OpenPactClient({ fetch: m.fetch, pactId: 'default' }))
  await r.addMember(KEY, { indexer: true })
  t.is(JSON.parse(m.calls[0].body!).indexer, true)
})

test('admin.removeMember: DELETE with key in path', async (t) => {
  const m = mockFetch({ status: 200, body: { ok: true, key: KEY } })
  const r = adminResource(new OpenPactClient({ fetch: m.fetch, pactId: 'default' }))
  await r.removeMember(KEY)
  t.is(m.calls[0].method, 'DELETE')
  t.is(m.calls[0].url, `http://127.0.0.1:7666/v1/pacts/default/admin/members/${KEY}`)
})

test('admin.addMember: 409 NOT_A_MEMBER → NotAMemberError', async (t) => {
  const m = mockFetch({
    status: 409,
    body: { error: 'NOT_A_MEMBER', message: 'this daemon is not a member' },
  })
  const r = adminResource(new OpenPactClient({ fetch: m.fetch, pactId: 'default' }))
  await t.exception(() => r.addMember(KEY), NotAMemberError)
})
