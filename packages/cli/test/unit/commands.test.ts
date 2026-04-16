import test from 'brittle'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { initCmd } from '../../src/commands/init'
import { joinCmd } from '../../src/commands/join'
import { stopCmd } from '../../src/commands/stop'
import { writePidFile } from '../../src/lib/pid'
import { config as daemonConfig } from '@openpact/daemon'

async function tmpHome(t: any): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openpact-cli-cmds-'))
  t.teardown(() => fs.rm(dir, { recursive: true, force: true }))
  return dir
}

function ctx(dir: string) {
  return { optsWithGlobals: () => ({ dataDir: dir }) }
}

/** Read the current pact's key from the registry. */
async function currentPactKey(hostDir: string): Promise<string | null> {
  const cfg = await daemonConfig.loadDaemonConfig(hostDir)
  const alias = cfg.currentAlias
  if (!alias) return null
  const entry = cfg.pacts.find((p) => p.alias === alias)
  return entry?.pactId ?? null
}

test('initCmd creates a pact and adds it to the registry', async (t) => {
  const dir = await tmpHome(t)
  await initCmd({ interactive: false }, ctx(dir))
  const cfg = await daemonConfig.loadDaemonConfig(dir)
  t.is(cfg.pacts.length, 1)
  t.ok(cfg.currentAlias, 'has a current alias')
  const pact = cfg.pacts[0]
  t.ok(pact.pactId.length > 0)
  t.ok(pact.dataDir.includes('pacts'))
})

test('initCmd: refuses second init at the same alias without --force', async (t) => {
  const dir = await tmpHome(t)
  await initCmd({ interactive: false, alias: 'iron' }, ctx(dir))
  await t.exception(
    () => initCmd({ interactive: false, alias: 'iron' }, ctx(dir)),
    /already exists/,
  )
})

test('initCmd: --force replaces the pact at the same alias', async (t) => {
  const dir = await tmpHome(t)
  await initCmd({ interactive: false, alias: 'iron' }, ctx(dir))
  const before = await currentPactKey(dir)
  await initCmd({ interactive: false, alias: 'iron', force: true }, ctx(dir))
  const after = await currentPactKey(dir)
  t.not(before, after, 'new pact key after --force')
})

test('joinCmd: rejects a non-base64url token', async (t) => {
  const dir = await tmpHome(t)
  await t.exception(
    () => joinCmd('not%%a%%valid%%token', { interactive: false }, ctx(dir)),
    /invalid invite token/,
  )
})

test('joinCmd: rejects an expired token before contacting the daemon', async (t) => {
  const dir = await tmpHome(t)
  const expired = Buffer.from(
    JSON.stringify({
      v: 1,
      pactId: 'a'.repeat(64),
      nonce: 'b'.repeat(48),
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    }),
    'utf8',
  ).toString('base64url')
  await t.exception(() => joinCmd(expired, { interactive: false }, ctx(dir)), /expired/)
})

test('joinCmd: does not redeem when the target pact has no online peers', async (t) => {
  const dir = await tmpHome(t)
  const future = new Date(Date.now() + 60_000).toISOString()
  const token = Buffer.from(
    JSON.stringify({
      v: 1,
      pactId: 'a'.repeat(64),
      nonce: 'b'.repeat(48),
      expiresAt: future,
      pactName: 'No peers yet',
    }),
    'utf8',
  ).toString('base64url')

  const originalFetch = globalThis.fetch
  let redeemCalls = 0
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    if (url.endsWith('/v1/ping')) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }
    if (url.endsWith('/v1/pacts/join')) {
      return new Response(
        JSON.stringify({ alias: 'joined', pact_id: 'a'.repeat(64), role: 'member' }),
        {
          status: 200,
        },
      )
    }
    if (url.endsWith('/v1/pacts/joined/status')) {
      return new Response(
        JSON.stringify({
          pact_id: 'a'.repeat(64),
          peer_handle: 'anon-krait-7f2d',
          public_key: 'c'.repeat(64),
          peers: 0,
          is_member: false,
        }),
        { status: 200 },
      )
    }
    if (url.endsWith('/v1/pacts/joined/invites/redeem')) {
      redeemCalls++
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }
    throw new Error(`unexpected fetch: ${url}`)
  }) as typeof globalThis.fetch
  t.teardown(() => {
    globalThis.fetch = originalFetch
  })

  await t.exception(
    () =>
      joinCmd(
        token,
        { interactive: false, displayName: 'tester', port: 19999, timeout: '0' },
        ctx(dir),
      ),
    /could not find an indexer peer/,
  )
  t.is(redeemCalls, 0, 'redeem is never attempted without pact-scoped online peers')
})

// Happy-path invite / join live in
//   packages/daemon/test/integration/invite-redeem.test.ts
// which runs two daemons over a hyperdht testnet. The CLI-only unit
// suite keeps just the client-side validation cases above.

test('stopCmd: no PID file → no-op', async (t) => {
  const dir = await tmpHome(t)
  await fs.mkdir(dir, { recursive: true })
  await stopCmd({}, ctx(dir))
  t.pass()
})

test('stopCmd: stale PID file is cleaned up', async (t) => {
  const dir = await tmpHome(t)
  await writePidFile(dir, 999_999)
  await stopCmd({}, ctx(dir))
  await t.exception(() => fs.access(path.join(dir, 'pid')))
})
