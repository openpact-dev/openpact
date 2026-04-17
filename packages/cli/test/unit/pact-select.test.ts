/**
 * Unit tests for the `resolveCurrentPact` precedence rules. Uses a
 * temp dir as the host so we don't touch the caller's `~/.openpact`.
 */
import test from 'brittle'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { resolveCurrentPact, NoPactsError } from '../../src/lib/pact-select'

async function makeHost(
  t: any,
  cfg: {
    pacts?: Array<{ alias: string; pactId: string; dataDir: string }>
    currentAlias?: string | null
  } = {},
): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openpact-hostcfg-'))
  t.teardown(() => fs.rm(dir, { recursive: true, force: true }))
  // Config file shape matches DaemonConfig; only the fields
  // resolveCurrentPact inspects matter here.
  const config = {
    port: 7666,
    pacts: cfg.pacts ?? [],
    currentAlias: cfg.currentAlias ?? null,
    apiToken: '0'.repeat(64),
  }
  await fs.writeFile(path.join(dir, 'daemon.json'), JSON.stringify(config), 'utf8')
  return dir
}

test('resolveCurrentPact: explicit --pact flag wins', async (t) => {
  const dir = await makeHost(t, {
    pacts: [{ alias: 'alpha', pactId: 'aa'.repeat(32), dataDir: '/tmp/alpha' }],
    currentAlias: 'alpha',
  })
  const resolved = await resolveCurrentPact(dir, 'explicit')
  t.is(resolved, 'explicit')
})

test('resolveCurrentPact: OPENPACT_PACT env var used when no flag', async (t) => {
  const dir = await makeHost(t, {
    pacts: [{ alias: 'alpha', pactId: 'aa'.repeat(32), dataDir: '/tmp/alpha' }],
    currentAlias: 'alpha',
  })
  const prev = process.env.OPENPACT_PACT
  process.env.OPENPACT_PACT = 'from-env'
  t.teardown(() => {
    if (prev === undefined) delete process.env.OPENPACT_PACT
    else process.env.OPENPACT_PACT = prev
  })
  const resolved = await resolveCurrentPact(dir, undefined)
  t.is(resolved, 'from-env')
})

test('resolveCurrentPact: falls back to currentAlias when no flag / env', async (t) => {
  const dir = await makeHost(t, {
    pacts: [
      { alias: 'alpha', pactId: 'aa'.repeat(32), dataDir: '/tmp/alpha' },
      { alias: 'beta', pactId: 'bb'.repeat(32), dataDir: '/tmp/beta' },
    ],
    currentAlias: 'beta',
  })
  const prev = process.env.OPENPACT_PACT
  delete process.env.OPENPACT_PACT
  t.teardown(() => {
    if (prev !== undefined) process.env.OPENPACT_PACT = prev
  })
  const resolved = await resolveCurrentPact(dir, undefined)
  t.is(resolved, 'beta', 'picks the registry-currentAlias')
})

test('resolveCurrentPact: falls back to first pact when currentAlias is null', async (t) => {
  const dir = await makeHost(t, {
    pacts: [
      { alias: 'alpha', pactId: 'aa'.repeat(32), dataDir: '/tmp/alpha' },
      { alias: 'beta', pactId: 'bb'.repeat(32), dataDir: '/tmp/beta' },
    ],
    currentAlias: null,
  })
  const prev = process.env.OPENPACT_PACT
  delete process.env.OPENPACT_PACT
  t.teardown(() => {
    if (prev !== undefined) process.env.OPENPACT_PACT = prev
  })
  const resolved = await resolveCurrentPact(dir, undefined)
  t.is(resolved, 'alpha', 'picks the first pact in the registry')
})

test('resolveCurrentPact: throws NoPactsError when registry is empty', async (t) => {
  const dir = await makeHost(t, { pacts: [], currentAlias: null })
  const prev = process.env.OPENPACT_PACT
  delete process.env.OPENPACT_PACT
  t.teardown(() => {
    if (prev !== undefined) process.env.OPENPACT_PACT = prev
  })
  await t.exception(() => resolveCurrentPact(dir, undefined), /no pacts at/)
})

test('resolveCurrentPact: throws NoPactsError when registry file is missing', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openpact-nocfg-'))
  t.teardown(() => fs.rm(dir, { recursive: true, force: true }))
  const prev = process.env.OPENPACT_PACT
  delete process.env.OPENPACT_PACT
  t.teardown(() => {
    if (prev !== undefined) process.env.OPENPACT_PACT = prev
  })
  let caught: unknown = null
  try {
    await resolveCurrentPact(dir, undefined)
  } catch (e) {
    caught = e
  }
  t.ok(caught instanceof NoPactsError, 'typed error surfaces so callers can render empty state')
})
