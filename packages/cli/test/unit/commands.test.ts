import test from 'brittle'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { initCmd } from '../../src/commands/init'
import { joinCmd } from '../../src/commands/join'
import { inviteCmd } from '../../src/commands/invite'
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

test('initCmd creates a pact', async (t) => {
  const dir = await tmpHome(t)
  await initCmd({}, ctx(dir))
  const cfg = await daemonConfig.loadConfig(dir)
  t.ok(typeof cfg.pactKey === 'string' && cfg.pactKey.length > 0)
  t.is(cfg.role, 'creator')
})

test('initCmd: refuses second init without --force', async (t) => {
  const dir = await tmpHome(t)
  await initCmd({}, ctx(dir))
  await t.exception(() => initCmd({}, ctx(dir)), /already sealed/)
})

test('initCmd: --force overwrites', async (t) => {
  const dir = await tmpHome(t)
  await initCmd({}, ctx(dir))
  const before = (await daemonConfig.loadConfig(dir)).pactKey
  await initCmd({ force: true }, ctx(dir))
  const after = (await daemonConfig.loadConfig(dir)).pactKey
  t.not(before, after, 'new pact key after --force')
})

test('joinCmd: rejects bad hex', async (t) => {
  const dir = await tmpHome(t)
  await t.exception(() => joinCmd('not-hex', {}, ctx(dir)), /must be hex/)
})

test('joinCmd: writes config with given key', async (t) => {
  const a = await tmpHome(t)
  const b = await tmpHome(t)
  await initCmd({}, ctx(a))
  const aKey = (await daemonConfig.loadConfig(a)).pactKey!

  await joinCmd(aKey, {}, ctx(b))
  const bCfg = await daemonConfig.loadConfig(b)
  t.is(bCfg.pactKey, aKey)
  t.is(bCfg.role, 'reader')
})

test('joinCmd: refuses second join without --force', async (t) => {
  const a = await tmpHome(t)
  const b = await tmpHome(t)
  await initCmd({}, ctx(a))
  const aKey = (await daemonConfig.loadConfig(a)).pactKey!
  await joinCmd(aKey, {}, ctx(b))
  await t.exception(() => joinCmd(aKey, {}, ctx(b)), /already sealed/)
})

test('inviteCmd: errors when no pact', async (t) => {
  const dir = await tmpHome(t)
  await t.exception(() => inviteCmd({}, ctx(dir)), /no pact at/)
})

test('inviteCmd: writes pact key to stdout', async (t) => {
  const dir = await tmpHome(t)
  await initCmd({}, ctx(dir))
  const cfg = await daemonConfig.loadConfig(dir)
  let captured = ''
  const orig = process.stdout.write.bind(process.stdout)
  process.stdout.write = (chunk: any) => {
    captured += chunk
    return true
  }
  try {
    await inviteCmd({}, ctx(dir))
  } finally {
    process.stdout.write = orig
  }
  t.is(captured.trim(), cfg.pactKey)
})

test('stopCmd: no PID file → no-op', async (t) => {
  const dir = await tmpHome(t)
  await fs.mkdir(dir, { recursive: true })
  // Should not throw.
  await stopCmd({}, ctx(dir))
  t.pass()
})

test('stopCmd: stale PID file is cleaned up', async (t) => {
  const dir = await tmpHome(t)
  await writePidFile(dir, 999_999) // unlikely to exist
  await stopCmd({}, ctx(dir))
  // PID file should be gone now.
  await t.exception(() => fs.access(path.join(dir, 'pid')))
})
