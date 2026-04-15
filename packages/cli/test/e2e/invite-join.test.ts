import test from 'brittle'
import { tmpHome, runWithDir } from './helpers/run-cli'

/*
 * E2E coverage for the new token-based invite / join surface.
 *
 * The full two-daemon happy path lives in
 *   packages/daemon/test/integration/invite-redeem.test.ts
 * which drives a hyperdht testnet. Here we only exercise CLI-local
 * surface — argv parsing, client-side token validation, daemon-down
 * behaviour — because spawning detached daemons from CLI e2e is slow
 * and flaky for two-peer scenarios.
 */

test('join: rejects a non-base64url token before touching the daemon', async (t) => {
  const home = await tmpHome(t)
  const res = await runWithDir(home, ['join', 'not%%a%%token'])
  t.not(res.exitCode, 0)
  t.ok(res.stderr.includes('invalid invite token'))
})

test('join: rejects an expired token', async (t) => {
  const home = await tmpHome(t)
  const expired = Buffer.from(
    JSON.stringify({
      v: 1,
      pactId: 'a'.repeat(64),
      nonce: 'b'.repeat(48),
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    }),
    'utf8',
  ).toString('base64url')
  const res = await runWithDir(home, ['join', expired, '--no-interactive'])
  t.not(res.exitCode, 0)
  t.ok(res.stderr.toLowerCase().includes('expired'))
})

test('invite: errors cleanly when the daemon is not running', async (t) => {
  const home = await tmpHome(t)
  await runWithDir(home, ['init', '--no-interactive', '--no-start'])
  const res = await runWithDir(home, ['invite'])
  t.not(res.exitCode, 0)
  t.ok(res.stderr.toLowerCase().includes('not running'))
})
