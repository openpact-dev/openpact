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

test('loadConfig: missing file returns defaults', async (t) => {
  const dir = await tmpDir(t)
  const c = await config.loadConfig(dir)
  t.alike(c, { pactKey: null, role: null, port: 7331 })
})

test('saveConfig + loadConfig round-trip', async (t) => {
  const dir = await tmpDir(t)
  await config.saveConfig(dir, { pactKey: 'abc123', role: 'creator', port: 7331 })
  const c = await config.loadConfig(dir)
  t.is(c.pactKey, 'abc123')
  t.is(c.role, 'creator')
  t.is(c.port, 7331)
})

test('saveConfig: creates dataDir if missing', async (t) => {
  const dir = await tmpDir(t)
  const nested = path.join(dir, 'nested', 'deep')
  await config.saveConfig(nested, { pactKey: null, role: 'reader', port: 7331 })
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
  t.exception(
    () => config.validate({ pactKey: null, role: 'admin' as any, port: 7331 }),
    /invalid role/,
  )
})

test('validate: bad port rejects', (t) => {
  t.exception(() => config.validate({ pactKey: null, role: null, port: 0 }), /port must be/)
  t.exception(() => config.validate({ pactKey: null, role: null, port: 70000 }), /port must be/)
})

test('validate: malformed pactKey rejects', (t) => {
  t.exception(() => config.validate({ pactKey: 'not-hex', role: null, port: 7331 }))
})

test('validate: null pactKey allowed', (t) => {
  t.execution(() => config.validate({ pactKey: null, role: null, port: 7331 }))
})

test('saveConfig: invalid config rejects', async (t) => {
  const dir = await tmpDir(t)
  await t.exception.all(() => config.saveConfig(dir, { role: 'x' as any, port: 7331 } as any))
})

test('loadConfig: partial file fills with defaults', async (t) => {
  const dir = await tmpDir(t)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(configPath(dir), JSON.stringify({ pactKey: 'deadbeef' }), 'utf8')
  const c = await config.loadConfig(dir)
  t.is(c.pactKey, 'deadbeef')
  t.is(c.port, 7331)
  t.is(c.role, null)
})
