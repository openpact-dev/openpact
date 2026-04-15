import test from 'brittle'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import * as config from '../../src/config'
import { configPath } from '../../src/data-dir'

async function tmpDir(t: any): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openpact-cfg-'))
  t.teardown(() => fs.rm(dir, { recursive: true, force: true }))
  return dir
}

/** Build a valid Config with overrides. */
function c(overrides: Partial<config.Config> = {}): config.Config {
  return { ...config.defaults(), ...overrides }
}

test('loadConfig: missing file returns defaults', async (t) => {
  const dir = await tmpDir(t)
  const cfg = await config.loadConfig(dir)
  t.alike(cfg, {
    pactKey: null,
    pactName: null,
    pactPurpose: null,
    displayName: null,
    role: null,
    port: 7666,
  })
})

test('saveConfig + loadConfig round-trip', async (t) => {
  const dir = await tmpDir(t)
  await config.saveConfig(dir, c({ pactKey: 'abc123', role: 'creator' }))
  const cfg = await config.loadConfig(dir)
  t.is(cfg.pactKey, 'abc123')
  t.is(cfg.role, 'creator')
  t.is(cfg.port, 7666)
})

test('saveConfig: creates dataDir if missing', async (t) => {
  const dir = await tmpDir(t)
  const nested = path.join(dir, 'nested', 'deep')
  await config.saveConfig(nested, c({ role: 'reader' }))
  const stat = await fs.stat(configPath(nested))
  t.ok(stat.isFile())
})

test('loadConfig: corrupt JSON throws clear error', async (t) => {
  const dir = await tmpDir(t)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(configPath(dir), 'not json', 'utf8')
  await t.exception(() => config.loadConfig(dir), /not valid JSON/)
})

test('loadConfig: non-object JSON throws', async (t) => {
  const dir = await tmpDir(t)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(configPath(dir), '[1,2,3]', 'utf8')
  await t.exception(() => config.loadConfig(dir), /must contain a JSON object/)
})

test('validate: invalid role rejects', (t) => {
  t.exception(() => config.validate(c({ role: 'admin' as any })), /invalid role/)
})

test('validate: bad port rejects', (t) => {
  t.exception(() => config.validate(c({ port: 0 })), /port must be/)
  t.exception(() => config.validate(c({ port: 70000 })), /port must be/)
})

test('validate: malformed pactKey rejects', (t) => {
  t.exception(() => config.validate(c({ pactKey: 'not-hex' })))
})

test('validate: null pactKey allowed', (t) => {
  t.execution(() => config.validate(c()))
})

test('saveConfig: invalid config rejects', async (t) => {
  const dir = await tmpDir(t)
  await t.exception.all(() => config.saveConfig(dir, { role: 'x' as any, port: 7666 } as any))
})

test('loadConfig: partial file fills with defaults', async (t) => {
  const dir = await tmpDir(t)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(configPath(dir), JSON.stringify({ pactKey: 'deadbeef' }), 'utf8')
  const cfg = await config.loadConfig(dir)
  t.is(cfg.pactKey, 'deadbeef')
  t.is(cfg.port, 7666)
  t.is(cfg.role, null)
  t.is(cfg.pactName, null)
  t.is(cfg.pactPurpose, null)
  t.is(cfg.displayName, null)
})

// Identity fields — pactName / pactPurpose / displayName
test('identity round-trips through save/load', async (t) => {
  const dir = await tmpDir(t)
  await config.saveConfig(
    dir,
    c({
      pactKey: 'aabb',
      pactName: 'The Obsidian Accord',
      pactPurpose: 'a pact among daemons',
      displayName: 'Cinnabar',
    }),
  )
  const cfg = await config.loadConfig(dir)
  t.is(cfg.pactName, 'The Obsidian Accord')
  t.is(cfg.pactPurpose, 'a pact among daemons')
  t.is(cfg.displayName, 'Cinnabar')
})

test('validate: pactName over 64 chars rejects', (t) => {
  t.exception(() => config.validate(c({ pactName: 'a'.repeat(65) })), /pactName/)
})

test('validate: pactPurpose over 200 chars rejects', (t) => {
  t.exception(() => config.validate(c({ pactPurpose: 'a'.repeat(201) })), /pactPurpose/)
})

test('validate: displayName over 64 chars rejects', (t) => {
  t.exception(() => config.validate(c({ displayName: 'a'.repeat(65) })), /displayName/)
})

test('validate: identity fields accept null', (t) => {
  t.execution(() => config.validate(c({ pactName: null, pactPurpose: null, displayName: null })))
})

test('validate: identity fields reject non-strings', (t) => {
  t.exception(() => config.validate(c({ pactName: 42 as any })))
  t.exception(() => config.validate(c({ displayName: { a: 1 } as any })))
})
