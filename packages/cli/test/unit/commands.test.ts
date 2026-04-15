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

test('joinCmd: rejects bad hex', async (t) => {
  const dir = await tmpHome(t)
  await t.exception(() => joinCmd('not-hex', { interactive: false }, ctx(dir)), /must be hex/)
})

test('joinCmd: writes a joined pact into the registry', async (t) => {
  const a = await tmpHome(t)
  const b = await tmpHome(t)
  await initCmd({ interactive: false }, ctx(a))
  const aKey = await currentPactKey(a)
  t.ok(aKey, 'creator has a key')

  await joinCmd(aKey!, { interactive: false }, ctx(b))
  const bCfg = await daemonConfig.loadDaemonConfig(b)
  t.is(bCfg.pacts.length, 1)
  t.is(bCfg.pacts[0].pactId, aKey)
  // Read the per-pact config to confirm the reader role.
  const pactDir = bCfg.pacts[0].dataDir
  const pactCfg = await daemonConfig.loadPactConfig(pactDir)
  t.is(pactCfg.role, 'reader')
})

test('joinCmd: refuses second join at the same alias without --force', async (t) => {
  const a = await tmpHome(t)
  const b = await tmpHome(t)
  await initCmd({ interactive: false }, ctx(a))
  const aKey = await currentPactKey(a)
  await joinCmd(aKey!, { interactive: false, alias: 'peer' }, ctx(b))
  await t.exception(
    () => joinCmd(aKey!, { interactive: false, alias: 'peer' }, ctx(b)),
    /already exists/,
  )
})

test('inviteCmd: errors when no pacts', async (t) => {
  const dir = await tmpHome(t)
  await t.exception(() => inviteCmd({}, ctx(dir)), /no pacts at/)
})

test('inviteCmd: writes current pact key to stdout', async (t) => {
  const dir = await tmpHome(t)
  await initCmd({ interactive: false }, ctx(dir))
  const expected = await currentPactKey(dir)
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
  t.is(captured.trim(), expected)
})

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
