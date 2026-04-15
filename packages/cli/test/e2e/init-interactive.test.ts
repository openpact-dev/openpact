import test from 'brittle'
import fs from 'fs/promises'
import path from 'path'
import { tmpHome, runWithDir } from './helpers/run-cli'

// These tests exercise the non-interactive path of `init` + `join` —
// the one CI and scripts use. stdin on an execa subprocess is a pipe,
// not a TTY, so askText falls through to the default silently.

/** Read the per-pact config written by init/join (new multi-pact layout). */
async function currentPactConfig(hostDir: string): Promise<any> {
  const daemonCfg = JSON.parse(await fs.readFile(path.join(hostDir, 'daemon.json'), 'utf8'))
  const alias = daemonCfg.currentAlias
  const entry = daemonCfg.pacts.find((p: any) => p.alias === alias)
  return JSON.parse(await fs.readFile(path.join(entry.dataDir, 'config.json'), 'utf8'))
}

test('init --no-interactive --name --purpose --display-name persists config', async (t) => {
  const home = await tmpHome(t)
  const res = await runWithDir(home, [
    'init',
    '--no-interactive',
    '--name',
    'Test Pact',
    '--purpose',
    'automated checking',
    '--display-name',
    'TestUser',
  ])
  t.is(res.exitCode, 0)
  t.ok(res.stdout.includes('Test Pact'))
  t.ok(res.stdout.includes('automated checking'))
  t.ok(res.stdout.includes('TestUser'))

  const cfg = await currentPactConfig(home)
  t.is(cfg.pactName, 'Test Pact')
  t.is(cfg.pactPurpose, 'automated checking')
  t.is(cfg.displayName, 'TestUser')
})

test('init without flags still produces a themed default', async (t) => {
  const home = await tmpHome(t)
  const res = await runWithDir(home, ['init', '--no-interactive'])
  t.is(res.exitCode, 0)

  const cfg = await currentPactConfig(home)
  t.ok(typeof cfg.pactName === 'string' && cfg.pactName.length > 0)
  t.ok(typeof cfg.pactPurpose === 'string' && cfg.pactPurpose.length > 0)
  t.ok(typeof cfg.displayName === 'string' && cfg.displayName.length > 0)
  t.ok(/^The /.test(cfg.pactName), 'themed default format')
})

test('join --no-interactive --display-name persists displayName', async (t) => {
  const a = await tmpHome(t)
  const b = await tmpHome(t)
  await runWithDir(a, ['init', '--no-interactive', '--name', 'A', '--display-name', 'Creator'])
  const inv = await runWithDir(a, ['invite'])
  const key = inv.stdout.trim()
  t.ok(/^[0-9a-f]{64}$/.test(key), 'invite key is 64-hex')

  const res = await runWithDir(b, ['join', key, '--no-interactive', '--display-name', 'Joiner'])
  t.is(res.exitCode, 0)
  t.ok(res.stdout.includes('Joiner'))

  const cfg = await currentPactConfig(b)
  t.is(cfg.displayName, 'Joiner')
  t.is(cfg.role, 'reader')
})

test('--name over 64 chars rejected by config validation', async (t) => {
  const home = await tmpHome(t)
  const tooLong = 'x'.repeat(65)
  const res = await runWithDir(home, ['init', '--no-interactive', '--name', tooLong])
  t.not(res.exitCode, 0)
  t.ok(res.stderr.includes('pactName') || res.stderr.includes('64'))
})

test('init without TTY does not auto-start (CI-safe default)', async (t) => {
  const home = await tmpHome(t)
  const res = await runWithDir(home, ['init', '--no-interactive'])
  t.is(res.exitCode, 0)
  t.ok(res.stdout.includes('pact has been sealed'))
  t.ok(res.stdout.includes('next:  openpact start'))
  let stat: any = null
  try {
    stat = await fs.stat(path.join(home, 'pid'))
  } catch {
    /* expected: no pid file */
  }
  t.absent(stat, 'no pid file — no detached daemon')
})
