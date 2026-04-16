import test from 'brittle'
import b4a from 'b4a'
import { createApi } from '../../../src/api'
import { tmpDaemon } from '../../helpers/tmp-daemon'

const KEY_B = 'bb'.repeat(32)

async function bootApi(t: any, opts: any = {}) {
  const { daemon } = await tmpDaemon(t, { start: false, ...opts })
  const app = createApi(daemon)
  t.teardown(() => app.close())
  return { app, daemon }
}

test('POST /invites: missing confirm returns 400', async (t) => {
  const { app } = await bootApi(t)
  const res = await app.inject({
    method: 'POST',
    url: '/v1/pacts/default/invites',
    payload: {},
  })
  t.is(res.statusCode, 400)
})

test('POST /invites: confirm=true on creator returns token + share_url', async (t) => {
  const { app } = await bootApi(t)
  const res = await app.inject({
    method: 'POST',
    url: '/v1/pacts/default/invites',
    payload: { confirm: true },
  })
  t.is(res.statusCode, 200)
  const body = JSON.parse(res.body)
  t.ok(typeof body.token === 'string' && body.token.length > 20)
  t.ok(typeof body.share_url === 'string' && body.share_url.includes('invite='))
  t.ok(/^[0-9a-f]{48}$/.test(body.nonce))
  t.ok(new Date(body.expires_at) > new Date())
})

test('POST /invites: honours ttl_ms', async (t) => {
  const { app } = await bootApi(t)
  const res = await app.inject({
    method: 'POST',
    url: '/v1/pacts/default/invites',
    payload: { confirm: true, ttl_ms: 60_000 },
  })
  t.is(res.statusCode, 200)
  const body = JSON.parse(res.body)
  const expectedExp = Date.now() + 60_000
  const actualExp = Date.parse(body.expires_at)
  t.ok(Math.abs(actualExp - expectedExp) < 5_000)
})

test('POST /invites: non-creator returns 409 NOT_CREATOR', async (t) => {
  const { app, daemon } = await bootApi(t)
  ;(daemon as any).current._role = 'reader'
  const res = await app.inject({
    method: 'POST',
    url: '/v1/pacts/default/invites',
    payload: { confirm: true },
  })
  t.is(res.statusCode, 409)
  t.is(JSON.parse(res.body).error, 'NOT_CREATOR')
})

test('GET /invites: empty list initially', async (t) => {
  const { app } = await bootApi(t)
  const res = await app.inject({ method: 'GET', url: '/v1/pacts/default/invites' })
  t.is(res.statusCode, 200)
  const body = JSON.parse(res.body)
  t.alike(body, { entries: [], cursor: null, has_more: false })
})

test('GET /invites: lists live invites after mint', async (t) => {
  const { app } = await bootApi(t)
  await app.inject({
    method: 'POST',
    url: '/v1/pacts/default/invites',
    payload: { confirm: true },
  })
  const res = await app.inject({ method: 'GET', url: '/v1/pacts/default/invites' })
  const body = JSON.parse(res.body)
  t.is(body.entries.length, 1)
  t.absent(body.entries[0].dead)
  t.absent(body.entries[0].revoked)
  t.is(body.entries[0].spent_at, null)
})

test('DELETE /invites/:nonce: confirm must match nonce', async (t) => {
  const { app } = await bootApi(t)
  const mint = await app.inject({
    method: 'POST',
    url: '/v1/pacts/default/invites',
    payload: { confirm: true },
  })
  const { nonce } = JSON.parse(mint.body)
  const bad = await app.inject({
    method: 'DELETE',
    url: `/v1/pacts/default/invites/${nonce}`,
    payload: { confirm: '0'.repeat(48) },
  })
  t.is(bad.statusCode, 400)
})

test('DELETE /invites/:nonce: revoking flips dead=true', async (t) => {
  const { app } = await bootApi(t)
  const mint = await app.inject({
    method: 'POST',
    url: '/v1/pacts/default/invites',
    payload: { confirm: true },
  })
  const { nonce } = JSON.parse(mint.body)
  const res = await app.inject({
    method: 'DELETE',
    url: `/v1/pacts/default/invites/${nonce}`,
    payload: { confirm: nonce },
  })
  t.is(res.statusCode, 200)

  const list = await app.inject({ method: 'GET', url: '/v1/pacts/default/invites' })
  const body = JSON.parse(list.body)
  t.is(body.entries[0].revoked, true)
  t.ok(body.entries[0].dead)
})

test('DELETE /invites/:nonce: unknown nonce returns 404', async (t) => {
  const { app } = await bootApi(t)
  const fake = 'f'.repeat(48)
  const res = await app.inject({
    method: 'DELETE',
    url: `/v1/pacts/default/invites/${fake}`,
    payload: { confirm: fake },
  })
  t.is(res.statusCode, 404)
})

test('POST /invites/redeem: happy path with self-redeem adds invite-redeemed to view', async (t) => {
  const { app, daemon } = await bootApi(t)
  const mint = await app.inject({
    method: 'POST',
    url: '/v1/pacts/default/invites',
    payload: { confirm: true },
  })
  const { token, nonce } = JSON.parse(mint.body)

  const res = await app.inject({
    method: 'POST',
    url: '/v1/pacts/default/invites/redeem',
    payload: { token, writer_key: KEY_B, confirm: true },
  })
  t.is(res.statusCode, 200)
  t.is(JSON.parse(res.body).nonce, nonce)

  // View should now contain _invites/<nonce>
  const pact = (daemon as any).current
  const view = pact.view
  // Give Autobase a moment to apply the writer's own appends.
  await new Promise((r) => setTimeout(r, 50))
  const spent = await view.get(`_invites/${nonce}`)
  t.ok(spent)
  t.is((spent.value as { redeemed_by: string }).redeemed_by, KEY_B)
})

test('POST /invites/redeem: second redeem returns 409 INVITE_SPENT', async (t) => {
  const { app } = await bootApi(t)
  const mint = await app.inject({
    method: 'POST',
    url: '/v1/pacts/default/invites',
    payload: { confirm: true },
  })
  const { token } = JSON.parse(mint.body)

  const first = await app.inject({
    method: 'POST',
    url: '/v1/pacts/default/invites/redeem',
    payload: { token, writer_key: KEY_B, confirm: true },
  })
  t.is(first.statusCode, 200)

  const second = await app.inject({
    method: 'POST',
    url: '/v1/pacts/default/invites/redeem',
    payload: { token, writer_key: KEY_B, confirm: true },
  })
  t.is(second.statusCode, 409)
  t.is(JSON.parse(second.body).error, 'INVITE_SPENT')
})

test('POST /invites/redeem: after revoke returns 409 INVITE_REVOKED', async (t) => {
  const { app } = await bootApi(t)
  const mint = await app.inject({
    method: 'POST',
    url: '/v1/pacts/default/invites',
    payload: { confirm: true },
  })
  const { token, nonce } = JSON.parse(mint.body)

  await app.inject({
    method: 'DELETE',
    url: `/v1/pacts/default/invites/${nonce}`,
    payload: { confirm: nonce },
  })

  const res = await app.inject({
    method: 'POST',
    url: '/v1/pacts/default/invites/redeem',
    payload: { token, writer_key: KEY_B, confirm: true },
  })
  t.is(res.statusCode, 409)
  t.is(JSON.parse(res.body).error, 'INVITE_REVOKED')
})

test('POST /invites/redeem: expired token returns 410 INVITE_EXPIRED', async (t) => {
  const { app, daemon } = await bootApi(t)
  const pact = (daemon as any).current
  // Can't POST an expired ttl via the API (min 60s); hand-construct
  // an expired token and matching invites.json entry so the redeem
  // handler sees a live record that's past expiry.
  const invites = await import('../../../src/invites')
  const pastPayload = {
    v: 1 as const,
    pactId: pact.pactKey,
    nonce: 'a'.repeat(48),
    expiresAt: new Date(Date.now() - 1000).toISOString(),
    pactName: null,
    pactPurpose: null,
    issuerDisplay: null,
  }
  const token = invites.encodeToken(pastPayload)
  await invites.saveInvites(pact.dataDir, {
    invites: [
      {
        nonce: pastPayload.nonce,
        expiresAt: pastPayload.expiresAt,
        createdAt: new Date(Date.now() - 2000).toISOString(),
        ttlMs: 1000,
        pactName: null,
        issuerDisplay: null,
        revoked: false,
        revokedAt: null,
        spentAt: null,
        spentBy: null,
      },
    ],
  })

  const res = await app.inject({
    method: 'POST',
    url: '/v1/pacts/default/invites/redeem',
    payload: { token, writer_key: KEY_B, confirm: true },
  })
  t.is(res.statusCode, 410)
  t.is(JSON.parse(res.body).error, 'INVITE_EXPIRED')
})

test('POST /invites/redeem: wrong-pact token returns 400 INVITE_WRONG_PACT', async (t) => {
  const { app } = await bootApi(t)
  const invites = await import('../../../src/invites')
  const badToken = invites.encodeToken({
    v: 1,
    pactId: 'a'.repeat(64), // not this pact
    nonce: invites.newNonce(),
    expiresAt: new Date(Date.now() + 100_000).toISOString(),
    pactName: null,
    pactPurpose: null,
    issuerDisplay: null,
  })
  const res = await app.inject({
    method: 'POST',
    url: '/v1/pacts/default/invites/redeem',
    payload: { token: badToken, writer_key: KEY_B, confirm: true },
  })
  t.is(res.statusCode, 400)
  t.is(JSON.parse(res.body).error, 'INVITE_WRONG_PACT')
})

test('POST /invites/redeem: garbage token returns 400 INVITE_BAD_SHAPE', async (t) => {
  const { app } = await bootApi(t)
  const res = await app.inject({
    method: 'POST',
    url: '/v1/pacts/default/invites/redeem',
    payload: { token: 'thisisnotatoken', writer_key: KEY_B, confirm: true },
  })
  t.is(res.statusCode, 400)
  t.is(JSON.parse(res.body).error, 'INVITE_BAD_SHAPE')
})

test('POST /invites/redeem: confirm=false returns 400 NOT_CONFIRMED', async (t) => {
  const { app } = await bootApi(t)
  // Token must satisfy minLength=8; we never decode it because the
  // confirm guard fires first.
  const res = await app.inject({
    method: 'POST',
    url: '/v1/pacts/default/invites/redeem',
    payload: { token: 'placeholder-longer-than-8', writer_key: KEY_B, confirm: false },
  })
  t.is(res.statusCode, 400)
  t.is(JSON.parse(res.body).error, 'NOT_CONFIRMED')
})

// Silence the unused-import warning where applicable.
void b4a
