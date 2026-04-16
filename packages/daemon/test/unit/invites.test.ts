import test from 'brittle'
import os from 'os'
import path from 'path'
import fs from 'fs/promises'
import {
  newNonce,
  encodeToken,
  decodeToken,
  InviteDecodeError,
  loadInvites,
  saveInvites,
  isDead,
  summarise,
  type Invite,
  type InviteTokenPayload,
} from '../../src/invites'

function tmpDir(): string {
  return path.join(os.tmpdir(), 'op-invites-' + Math.random().toString(36).slice(2, 10))
}

const PACT_ID = 'a'.repeat(64)

test('newNonce: 48 hex characters, random each call', (t) => {
  const a = newNonce()
  const b = newNonce()
  t.is(a.length, 48)
  t.ok(/^[0-9a-f]{48}$/.test(a))
  t.not(a, b)
})

test('encode/decode round-trips a valid payload', (t) => {
  const payload: InviteTokenPayload = {
    v: 1,
    pactId: PACT_ID,
    nonce: newNonce(),
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    pactName: 'crimson-covenant',
    issuerDisplay: 'Ana',
  }
  const token = encodeToken(payload)
  const decoded = decodeToken(token)
  t.alike(decoded, payload)
})

function expectDecodeError(
  t: Parameters<Parameters<typeof test>[1]>[0],
  token: string,
  code: InviteDecodeError['code'],
): void {
  try {
    decodeToken(token)
    t.fail('expected decodeToken to throw')
  } catch (e) {
    t.ok(e instanceof InviteDecodeError, 'is InviteDecodeError')
    t.is((e as InviteDecodeError).code, code)
  }
}

function encodeRaw(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url')
}

test('decodeToken: null/empty throws BAD_TOKEN', (t) => {
  expectDecodeError(t, '', 'BAD_TOKEN')
})

test('decodeToken: garbage base64 decodes but parses to non-JSON → BAD_TOKEN', (t) => {
  // base64url('@@@') is legal; the decoded string just won't be JSON.
  expectDecodeError(t, '@@@not-base64@@@', 'BAD_TOKEN')
})

test('decodeToken: wrong version throws BAD_VERSION', (t) => {
  expectDecodeError(
    t,
    encodeRaw({
      v: 2,
      pactId: PACT_ID,
      nonce: newNonce(),
      expiresAt: new Date().toISOString(),
    }),
    'BAD_VERSION',
  )
})

test('decodeToken: bad pactId shape throws BAD_SHAPE', (t) => {
  expectDecodeError(
    t,
    encodeRaw({
      v: 1,
      pactId: 'not-hex',
      nonce: newNonce(),
      expiresAt: new Date().toISOString(),
    }),
    'BAD_SHAPE',
  )
})

test('decodeToken: bad nonce shape throws BAD_SHAPE', (t) => {
  expectDecodeError(
    t,
    encodeRaw({
      v: 1,
      pactId: PACT_ID,
      nonce: 'short',
      expiresAt: new Date().toISOString(),
    }),
    'BAD_SHAPE',
  )
})

test('decodeToken: non-ISO expiresAt throws BAD_SHAPE', (t) => {
  expectDecodeError(
    t,
    encodeRaw({
      v: 1,
      pactId: PACT_ID,
      nonce: newNonce(),
      expiresAt: 'tomorrow',
    }),
    'BAD_SHAPE',
  )
})

test('loadInvites: missing file returns empty list', async (t) => {
  const dir = tmpDir()
  const result = await loadInvites(dir)
  t.alike(result, { invites: [] })
})

test('saveInvites / loadInvites round-trip', async (t) => {
  const dir = tmpDir()
  const inv: Invite = {
    nonce: newNonce(),
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    createdAt: new Date().toISOString(),
    ttlMs: 3600_000,
    pactName: 'iron-compact',
    issuerDisplay: null,
    revoked: false,
    revokedAt: null,
    spentAt: null,
    spentBy: null,
  }
  await saveInvites(dir, { invites: [inv] })
  const back = await loadInvites(dir)
  t.is(back.invites.length, 1)
  t.alike(back.invites[0], inv)
  await fs.rm(dir, { recursive: true, force: true })
})

test('saveInvites overwrites on subsequent calls', async (t) => {
  const dir = tmpDir()
  const a: Invite = {
    nonce: newNonce(),
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    createdAt: new Date().toISOString(),
    ttlMs: 3600_000,
    pactName: null,
    issuerDisplay: null,
    revoked: false,
    revokedAt: null,
    spentAt: null,
    spentBy: null,
  }
  await saveInvites(dir, { invites: [a] })
  await saveInvites(dir, { invites: [] })
  const back = await loadInvites(dir)
  t.is(back.invites.length, 0)
  await fs.rm(dir, { recursive: true, force: true })
})

test('isDead: future unrevoked → not dead', (t) => {
  const inv: Invite = {
    nonce: newNonce(),
    expiresAt: new Date(Date.now() + 1000).toISOString(),
    createdAt: new Date().toISOString(),
    ttlMs: 1000,
    pactName: null,
    issuerDisplay: null,
    revoked: false,
    revokedAt: null,
    spentAt: null,
    spentBy: null,
  }
  t.absent(isDead(inv, Date.now()))
})

test('isDead: past expiry → dead', (t) => {
  const inv: Invite = {
    nonce: newNonce(),
    expiresAt: new Date(Date.now() - 1000).toISOString(),
    createdAt: new Date().toISOString(),
    ttlMs: 1000,
    pactName: null,
    issuerDisplay: null,
    revoked: false,
    revokedAt: null,
    spentAt: null,
    spentBy: null,
  }
  t.ok(isDead(inv, Date.now()))
})

test('isDead: revoked → dead regardless of expiry', (t) => {
  const inv: Invite = {
    nonce: newNonce(),
    expiresAt: new Date(Date.now() + 100_000).toISOString(),
    createdAt: new Date().toISOString(),
    ttlMs: 100_000,
    pactName: null,
    issuerDisplay: null,
    revoked: true,
    revokedAt: new Date().toISOString(),
    spentAt: null,
    spentBy: null,
  }
  t.ok(isDead(inv, Date.now()))
})

test('isDead: spent → dead even if not revoked', (t) => {
  const inv: Invite = {
    nonce: newNonce(),
    expiresAt: new Date(Date.now() + 100_000).toISOString(),
    createdAt: new Date().toISOString(),
    ttlMs: 100_000,
    pactName: null,
    issuerDisplay: null,
    revoked: false,
    revokedAt: null,
    spentAt: new Date().toISOString(),
    spentBy: 'b'.repeat(64),
  }
  t.ok(isDead(inv, Date.now()))
})

test('summarise: maps snake-case fields + dead flag', (t) => {
  const inv: Invite = {
    nonce: 'a'.repeat(48),
    expiresAt: new Date(Date.now() + 100_000).toISOString(),
    createdAt: new Date().toISOString(),
    ttlMs: 100_000,
    pactName: 'iron-compact',
    issuerDisplay: 'Ana',
    revoked: false,
    revokedAt: null,
    spentAt: null,
    spentBy: null,
  }
  const s = summarise(inv, Date.now())
  t.is(s.nonce, inv.nonce)
  t.is(s.pact_name, 'iron-compact')
  t.is(s.issuer_display, 'Ana')
  t.absent(s.dead)
})
