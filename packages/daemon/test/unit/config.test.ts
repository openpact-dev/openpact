import test from 'brittle'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import * as config from '../../src/config'
import { pactConfigPath, daemonConfigPath, pactsRoot } from '../../src/data-dir'

async function tmpDir(t: any): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openpact-cfg-'))
  t.teardown(() => fs.rm(dir, { recursive: true, force: true }))
  return dir
}

/** Build a valid PactConfig with overrides. */
function p(overrides: Partial<config.PactConfig> = {}): config.PactConfig {
  return { ...config.pactDefaults(), ...overrides }
}
/** Build a valid DaemonConfig with overrides. */
function d(overrides: Partial<config.DaemonConfig> = {}): config.DaemonConfig {
  return { ...config.daemonDefaults(), ...overrides }
}

// ──────────────────────────────────────────────────────────────────
// PactConfig
// ──────────────────────────────────────────────────────────────────

test('loadPactConfig: missing file returns defaults', async (t) => {
  const dir = await tmpDir(t)
  const cfg = await config.loadPactConfig(dir)
  t.alike(cfg, {
    pactKey: null,
    pactName: null,
    pactPurpose: null,
    displayName: null,
    role: null,
  })
})

test('savePactConfig + loadPactConfig round-trip', async (t) => {
  const dir = await tmpDir(t)
  await config.savePactConfig(dir, p({ pactKey: 'abc123', role: 'creator' }))
  const cfg = await config.loadPactConfig(dir)
  t.is(cfg.pactKey, 'abc123')
  t.is(cfg.role, 'creator')
})

test('savePactConfig: creates pactDir if missing', async (t) => {
  const dir = await tmpDir(t)
  const nested = path.join(dir, 'nested', 'deep')
  await config.savePactConfig(nested, p({ role: 'member' }))
  const stat = await fs.stat(pactConfigPath(nested))
  t.ok(stat.isFile())
})

test('loadPactConfig: corrupt JSON throws', async (t) => {
  const dir = await tmpDir(t)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(pactConfigPath(dir), 'not json', 'utf8')
  await t.exception(() => config.loadPactConfig(dir), /not valid JSON/)
})

test('loadPactConfig: non-object JSON throws', async (t) => {
  const dir = await tmpDir(t)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(pactConfigPath(dir), '[1,2,3]', 'utf8')
  await t.exception(() => config.loadPactConfig(dir), /must contain a JSON object/)
})

test('validatePactConfig: invalid role rejects', (t) => {
  t.exception(() => config.validatePactConfig(p({ role: 'admin' as any })), /invalid role/)
})

test('validatePactConfig: malformed pactKey rejects', (t) => {
  t.exception(() => config.validatePactConfig(p({ pactKey: 'not-hex' })))
})

test('validatePactConfig: null pactKey allowed', (t) => {
  t.execution(() => config.validatePactConfig(p()))
})

test('loadPactConfig: partial file fills with defaults', async (t) => {
  const dir = await tmpDir(t)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(pactConfigPath(dir), JSON.stringify({ pactKey: 'deadbeef' }), 'utf8')
  const cfg = await config.loadPactConfig(dir)
  t.is(cfg.pactKey, 'deadbeef')
  t.is(cfg.role, null)
  t.is(cfg.pactName, null)
})

test('identity fields round-trip', async (t) => {
  const dir = await tmpDir(t)
  await config.savePactConfig(
    dir,
    p({
      pactKey: 'aabb',
      pactName: 'The Obsidian Accord',
      pactPurpose: 'a pact among daemons',
      displayName: 'Cinnabar',
    }),
  )
  const cfg = await config.loadPactConfig(dir)
  t.is(cfg.pactName, 'The Obsidian Accord')
  t.is(cfg.pactPurpose, 'a pact among daemons')
  t.is(cfg.displayName, 'Cinnabar')
})

test('validatePactConfig: pactName over 64 chars rejects', (t) => {
  t.exception(() => config.validatePactConfig(p({ pactName: 'a'.repeat(65) })), /pactName/)
})

test('validatePactConfig: pactPurpose over 200 chars rejects', (t) => {
  t.exception(() => config.validatePactConfig(p({ pactPurpose: 'a'.repeat(201) })), /pactPurpose/)
})

test('validatePactConfig: displayName over 64 chars rejects', (t) => {
  t.exception(() => config.validatePactConfig(p({ displayName: 'a'.repeat(65) })), /displayName/)
})

test('validatePactConfig: identity fields accept null', (t) => {
  t.execution(() =>
    config.validatePactConfig(p({ pactName: null, pactPurpose: null, displayName: null })),
  )
})

test('validatePactConfig: identity fields reject non-strings', (t) => {
  t.exception(() => config.validatePactConfig(p({ pactName: 42 as any })))
  t.exception(() => config.validatePactConfig(p({ displayName: { a: 1 } as any })))
})

// ──────────────────────────────────────────────────────────────────
// DaemonConfig
// ──────────────────────────────────────────────────────────────────

test('loadDaemonConfig: missing file returns defaults', async (t) => {
  const dir = await tmpDir(t)
  const cfg = await config.loadDaemonConfig(dir)
  t.alike(cfg, { port: 7666, pacts: [], currentAlias: null })
})

test('saveDaemonConfig + loadDaemonConfig round-trip', async (t) => {
  const dir = await tmpDir(t)
  const entry = {
    alias: 'iron-compact',
    pactId: 'aabbcc',
    dataDir: path.join(pactsRoot(dir), 'iron-compact'),
    addedAt: '2026-04-15T10:00:00.000Z',
  }
  await config.saveDaemonConfig(dir, d({ pacts: [entry], currentAlias: 'iron-compact' }))
  const cfg = await config.loadDaemonConfig(dir)
  t.is(cfg.currentAlias, 'iron-compact')
  t.is(cfg.pacts.length, 1)
  t.is(cfg.pacts[0].alias, 'iron-compact')
})

test('validateDaemonConfig: duplicate aliases reject', (t) => {
  const entryA = {
    alias: 'same',
    pactId: 'aa',
    dataDir: '/tmp/a',
    addedAt: '2026-04-15T10:00:00.000Z',
  }
  const entryB = { ...entryA, pactId: 'bb' }
  t.exception(() => config.validateDaemonConfig(d({ pacts: [entryA, entryB] })), /duplicate alias/)
})

test('validateDaemonConfig: bad pactId rejects', (t) => {
  const entry = {
    alias: 'x',
    pactId: 'NOTHEX',
    dataDir: '/tmp/x',
    addedAt: '2026-04-15T10:00:00.000Z',
  }
  t.exception(() => config.validateDaemonConfig(d({ pacts: [entry] })), /invalid pactId/)
})

test('validateDaemonConfig: currentAlias must be in pacts list', (t) => {
  t.exception(() => config.validateDaemonConfig(d({ currentAlias: 'missing' })), /currentAlias/)
})

test('validateDaemonConfig: bad port rejects', (t) => {
  t.exception(() => config.validateDaemonConfig(d({ port: 0 })), /port must be/)
})

test('daemon + pact configs live side-by-side', async (t) => {
  const dir = await tmpDir(t)
  await config.saveDaemonConfig(dir, d({ port: 7666 }))
  await config.savePactConfig(path.join(pactsRoot(dir), 'a'), p({ pactKey: 'abc' }))
  const daemonFile = daemonConfigPath(dir)
  const pactFile = pactConfigPath(path.join(pactsRoot(dir), 'a'))
  t.ok((await fs.stat(daemonFile)).isFile())
  t.ok((await fs.stat(pactFile)).isFile())
})
