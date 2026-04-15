import test from 'brittle'
import { OpenPactClient } from '../../src/client'
import { invitesResource } from '../../src/resources/invites'
import {
  InviteSpentError,
  InviteExpiredError,
  NotCreatorError,
  NoIndexerReachableError,
} from '../../src/errors'
import { mockFetch } from '../helpers/mock-fetch'

const TOKEN = 'dummy-token-base64url'
const WRITER = 'a'.repeat(64)
const NONCE = 'b'.repeat(48)
const PACT_ID = 'default'

test('invites.create: POST with confirm:true + share_url returned', async (t) => {
  const m = mockFetch({
    status: 200,
    body: {
      token: TOKEN,
      share_url: `https://openpact.dev/join?invite=${TOKEN}`,
      nonce: NONCE,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
    },
  })
  const r = invitesResource(new OpenPactClient({ fetch: m.fetch, pactId: PACT_ID }))
  const res = await r.create()
  t.is(m.calls[0].method, 'POST')
  t.is(m.calls[0].url, `http://127.0.0.1:7666/v1/pacts/${PACT_ID}/invites`)
  t.alike(JSON.parse(m.calls[0].body!), { confirm: true })
  t.is(res.token, TOKEN)
  t.ok(res.share_url.includes('invite='))
})

test('invites.create: honours ttlMs', async (t) => {
  const m = mockFetch({
    status: 200,
    body: { token: TOKEN, share_url: '', nonce: NONCE, expires_at: '' },
  })
  const r = invitesResource(new OpenPactClient({ fetch: m.fetch, pactId: PACT_ID }))
  await r.create({ ttlMs: 60_000 })
  t.alike(JSON.parse(m.calls[0].body!), { confirm: true, ttl_ms: 60_000 })
})

test('invites.create: 409 NOT_CREATOR → NotCreatorError', async (t) => {
  const m = mockFetch({
    status: 409,
    body: { error: 'NOT_CREATOR', message: 'only the creator can mint' },
  })
  const r = invitesResource(new OpenPactClient({ fetch: m.fetch, pactId: PACT_ID }))
  await t.exception(() => r.create(), NotCreatorError)
})

test('invites.list: GET returns entries array', async (t) => {
  const m = mockFetch({
    status: 200,
    body: {
      entries: [
        {
          nonce: NONCE,
          expires_at: '2026-04-22T00:00:00.000Z',
          created_at: '2026-04-15T00:00:00.000Z',
          pact_name: 'iron-compact',
          issuer_display: 'Ana',
          revoked: false,
          spent_at: null,
          spent_by: null,
          dead: false,
        },
      ],
      cursor: null,
      has_more: false,
    },
  })
  const r = invitesResource(new OpenPactClient({ fetch: m.fetch, pactId: PACT_ID }))
  const entries = await r.list()
  t.is(m.calls[0].method, 'GET')
  t.is(m.calls[0].url, `http://127.0.0.1:7666/v1/pacts/${PACT_ID}/invites`)
  t.is(entries.length, 1)
  t.is(entries[0].pact_name, 'iron-compact')
})

test('invites.revoke: DELETE with confirm body', async (t) => {
  const m = mockFetch({ status: 200, body: { ok: true, nonce: NONCE } })
  const r = invitesResource(new OpenPactClient({ fetch: m.fetch, pactId: PACT_ID }))
  await r.revoke(NONCE)
  t.is(m.calls[0].method, 'DELETE')
  t.is(m.calls[0].url, `http://127.0.0.1:7666/v1/pacts/${PACT_ID}/invites/${NONCE}`)
  t.alike(JSON.parse(m.calls[0].body!), { confirm: NONCE })
})

test('invites.redeem: POST with token + writer_key + confirm', async (t) => {
  const m = mockFetch({ status: 200, body: { ok: true, nonce: NONCE } })
  const r = invitesResource(new OpenPactClient({ fetch: m.fetch, pactId: PACT_ID }))
  await r.redeem(TOKEN, WRITER)
  t.is(m.calls[0].method, 'POST')
  t.is(m.calls[0].url, `http://127.0.0.1:7666/v1/pacts/${PACT_ID}/invites/redeem`)
  t.alike(JSON.parse(m.calls[0].body!), { token: TOKEN, writer_key: WRITER, confirm: true })
})

test('invites.redeem: 409 INVITE_SPENT → InviteSpentError', async (t) => {
  const m = mockFetch({
    status: 409,
    body: { error: 'INVITE_SPENT', message: 'already redeemed' },
  })
  const r = invitesResource(new OpenPactClient({ fetch: m.fetch, pactId: PACT_ID }))
  await t.exception(() => r.redeem(TOKEN, WRITER), InviteSpentError)
})

test('invites.redeem: 410 INVITE_EXPIRED → InviteExpiredError', async (t) => {
  const m = mockFetch({
    status: 410,
    body: { error: 'INVITE_EXPIRED', message: 'expired' },
  })
  const r = invitesResource(new OpenPactClient({ fetch: m.fetch, pactId: PACT_ID }))
  await t.exception(() => r.redeem(TOKEN, WRITER), InviteExpiredError)
})

test('invites.redeem: 503 NO_INDEXER_REACHABLE → NoIndexerReachableError', async (t) => {
  const m = mockFetch({
    status: 503,
    body: { error: 'NO_INDEXER_REACHABLE', message: 'no peers' },
  })
  const r = invitesResource(new OpenPactClient({ fetch: m.fetch, pactId: PACT_ID }))
  await t.exception(() => r.redeem(TOKEN, WRITER), NoIndexerReachableError)
})
