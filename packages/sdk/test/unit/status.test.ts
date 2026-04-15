import test from 'brittle'
import { OpenPactClient } from '../../src/client'
import { statusResource } from '../../src/resources/status'
import { mockFetch } from '../helpers/mock-fetch'

test('status.ping returns { ok: true }', async (t) => {
  const m = mockFetch({ status: 200, body: { ok: true } })
  const r = statusResource(new OpenPactClient({ fetch: m.fetch, pactId: 'default' }))
  const res = await r.ping()
  t.alike(res, { ok: true })
  t.is(m.calls[0].url, 'http://127.0.0.1:7666/v1/ping')
})

test('status.get returns full status payload', async (t) => {
  const payload = {
    pact_id: 'abc',
    peer_handle: 'anon-fox-1234',
    role: 'creator',
    public_key: 'def',
    peers: 2,
    entries: 14,
    is_writer: true,
    is_indexer: true,
    synced: true,
  }
  const m = mockFetch({ status: 200, body: payload })
  const r = statusResource(new OpenPactClient({ fetch: m.fetch, pactId: 'default' }))
  t.alike(await r.get(), payload)
})

test('status.peers returns array', async (t) => {
  const m = mockFetch({ status: 200, body: [{ id: 'x', remote_key: 'y', online: true }] })
  const r = statusResource(new OpenPactClient({ fetch: m.fetch, pactId: 'default' }))
  const peers = await r.peers()
  t.is(peers.length, 1)
})
