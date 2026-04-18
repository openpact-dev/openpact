import test from 'brittle'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { checkForUpdate, formatUpdateWarning, isOutdated } from '../../src/lib/version-check'

async function tmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'openpact-vcheck-'))
}

function mockFetch(body: unknown, init: { status?: number } = {}): typeof globalThis.fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status: init.status ?? 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof globalThis.fetch
}

test('isOutdated: newer patch / minor / major detected', (t) => {
  t.is(isOutdated('0.1.1', '0.1.2'), true)
  t.is(isOutdated('0.1.1', '0.2.0'), true)
  t.is(isOutdated('0.1.1', '1.0.0'), true)
})

test('isOutdated: equal or older returns false', (t) => {
  t.is(isOutdated('0.1.1', '0.1.1'), false)
  t.is(isOutdated('0.1.1', '0.1.0'), false)
  t.is(isOutdated('1.0.0', '0.9.9'), false)
})

test('isOutdated: prerelease suffix on current is stripped before compare', (t) => {
  t.is(isOutdated('0.1.1-rc.1', '0.1.1'), false, 'same numeric core means not outdated')
  t.is(isOutdated('0.1.1-rc.1', '0.1.2'), true)
})

test('checkForUpdate: skipped when OPENPACT_DISABLE_VERSION_CHECK=1', async (t) => {
  const dir = await tmpDir()
  t.teardown(() => fs.rm(dir, { recursive: true, force: true }))

  let fetchCalled = false
  const fetchImpl = (async () => {
    fetchCalled = true
    return new Response('{}', { status: 200 })
  }) as unknown as typeof globalThis.fetch

  const r = await checkForUpdate({
    current: '0.1.1',
    cacheDir: dir,
    env: { OPENPACT_DISABLE_VERSION_CHECK: '1' },
    fetchImpl,
  })
  t.is(r.skipped, true)
  t.is(r.reason, 'disabled')
  t.absent(fetchCalled, 'no registry hit')
})

test('checkForUpdate: skipped when CI env is set', async (t) => {
  const dir = await tmpDir()
  t.teardown(() => fs.rm(dir, { recursive: true, force: true }))
  const r = await checkForUpdate({
    current: '0.1.1',
    cacheDir: dir,
    env: { CI: 'true' },
    fetchImpl: mockFetch({ version: '99.0.0' }),
  })
  t.is(r.skipped, true)
  t.is(r.reason, 'ci')
})

test('checkForUpdate: skipped for dev versions (0.0.0 or prereleases)', async (t) => {
  const dir = await tmpDir()
  t.teardown(() => fs.rm(dir, { recursive: true, force: true }))

  for (const v of ['0.0.0', '0.1.2-rc.1', '1.0.0-beta']) {
    const r = await checkForUpdate({
      current: v,
      cacheDir: dir,
      env: {},
      fetchImpl: mockFetch({ version: '99.0.0' }),
    })
    t.is(r.skipped, true, `${v} should be treated as dev`)
    t.is(r.reason, 'dev')
  }
})

test('checkForUpdate: hits registry, flags outdated, writes cache', async (t) => {
  const dir = await tmpDir()
  t.teardown(() => fs.rm(dir, { recursive: true, force: true }))

  let calls = 0
  const fetchImpl = (async () => {
    calls++
    return new Response(JSON.stringify({ version: '0.2.0' }), { status: 200 })
  }) as unknown as typeof globalThis.fetch

  const now = () => 1000
  const r = await checkForUpdate({
    current: '0.1.1',
    cacheDir: dir,
    env: {},
    fetchImpl,
    now,
  })
  t.is(r.skipped, false)
  t.is(r.latest, '0.2.0')
  t.is(r.outdated, true)
  t.is(calls, 1)

  const cached = JSON.parse(await fs.readFile(path.join(dir, 'version-check.json'), 'utf8'))
  t.alike(cached, { checkedAt: 1000, latest: '0.2.0' })
})

test('checkForUpdate: reads cache within TTL and skips the fetch', async (t) => {
  const dir = await tmpDir()
  t.teardown(() => fs.rm(dir, { recursive: true, force: true }))
  await fs.writeFile(
    path.join(dir, 'version-check.json'),
    JSON.stringify({ checkedAt: 1000, latest: '0.9.0' }),
  )

  let calls = 0
  const fetchImpl = (async () => {
    calls++
    return new Response('{}', { status: 200 })
  }) as unknown as typeof globalThis.fetch

  const r = await checkForUpdate({
    current: '0.1.1',
    cacheDir: dir,
    env: {},
    fetchImpl,
    now: () => 1000 + 60 * 1000, // 60s later, well inside the 24h TTL
  })
  t.is(calls, 0, 'no network call')
  t.is(r.skipped, true)
  t.is(r.reason, 'cache-hit')
  t.is(r.latest, '0.9.0')
  t.is(r.outdated, true)
})

test('checkForUpdate: stale cache triggers a refresh', async (t) => {
  const dir = await tmpDir()
  t.teardown(() => fs.rm(dir, { recursive: true, force: true }))
  await fs.writeFile(
    path.join(dir, 'version-check.json'),
    JSON.stringify({ checkedAt: 1000, latest: '0.1.0' }),
  )

  let calls = 0
  const fetchImpl = (async () => {
    calls++
    return new Response(JSON.stringify({ version: '0.3.0' }), { status: 200 })
  }) as unknown as typeof globalThis.fetch

  const r = await checkForUpdate({
    current: '0.1.1',
    cacheDir: dir,
    env: {},
    fetchImpl,
    now: () => 1000 + 48 * 60 * 60 * 1000, // 48h later, past the 24h TTL
  })
  t.is(calls, 1)
  t.is(r.latest, '0.3.0')
  t.is(r.outdated, true)
})

test('checkForUpdate: network failure returns skipped without throwing', async (t) => {
  const dir = await tmpDir()
  t.teardown(() => fs.rm(dir, { recursive: true, force: true }))
  const fetchImpl = (async () => {
    throw new Error('ECONNREFUSED')
  }) as unknown as typeof globalThis.fetch

  const r = await checkForUpdate({
    current: '0.1.1',
    cacheDir: dir,
    env: {},
    fetchImpl,
  })
  t.is(r.skipped, true)
  t.is(r.reason, 'fetch-failed')
  t.is(r.outdated, false)
})

test('checkForUpdate: non-2xx from the registry is treated as a soft fail', async (t) => {
  const dir = await tmpDir()
  t.teardown(() => fs.rm(dir, { recursive: true, force: true }))
  const r = await checkForUpdate({
    current: '0.1.1',
    cacheDir: dir,
    env: {},
    fetchImpl: mockFetch({}, { status: 500 }),
  })
  t.is(r.skipped, true)
  t.is(r.reason, 'fetch-failed')
})

test('checkForUpdate: malformed body returns parse-failed', async (t) => {
  const dir = await tmpDir()
  t.teardown(() => fs.rm(dir, { recursive: true, force: true }))
  const r = await checkForUpdate({
    current: '0.1.1',
    cacheDir: dir,
    env: {},
    fetchImpl: mockFetch({ notVersion: 'oops' }),
  })
  t.is(r.skipped, true)
  t.is(r.reason, 'parse-failed')
})

test('formatUpdateWarning: null when current is up to date', (t) => {
  t.is(
    formatUpdateWarning({
      current: '0.1.1',
      latest: '0.1.1',
      outdated: false,
      skipped: false,
    }),
    null,
  )
})

test('formatUpdateWarning: includes both versions and the upgrade hint', (t) => {
  const msg = formatUpdateWarning({
    current: '0.1.1',
    latest: '0.2.0',
    outdated: true,
    skipped: false,
  })
  t.ok(msg)
  t.ok(msg!.includes('0.1.1'))
  t.ok(msg!.includes('0.2.0'))
  t.ok(msg!.includes('npm i -g @openpact/cli'))
  t.ok(msg!.includes('OPENPACT_DISABLE_VERSION_CHECK'))
  t.absent(msg!.includes('—'), 'no em-dashes in user-facing copy')
})
