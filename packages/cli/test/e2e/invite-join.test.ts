import test from 'brittle'
import fs from 'fs/promises'
import path from 'path'
import { tmpHome, runWithDir } from './helpers/run-cli'

test('invite prints pact key; join registers the pact', async (t) => {
  const a = await tmpHome(t)
  const b = await tmpHome(t)

  await runWithDir(a, ['init'])
  const inv = await runWithDir(a, ['invite'])
  t.is(inv.exitCode, 0)
  const key = inv.stdout.trim()
  t.ok(/^[0-9a-f]+$/.test(key), 'invite emits a hex key')

  const join = await runWithDir(b, ['join', key])
  t.is(join.exitCode, 0)
  t.ok(join.stdout.includes('Agent bound to the pact'))

  const daemonCfg = JSON.parse(await fs.readFile(path.join(b, 'daemon.json'), 'utf8'))
  t.is(daemonCfg.pacts.length, 1)
  t.is(daemonCfg.pacts[0].pactId, key)
  const pactDir = daemonCfg.pacts[0].dataDir
  const pactCfg = JSON.parse(await fs.readFile(path.join(pactDir, 'config.json'), 'utf8'))
  t.is(pactCfg.role, 'reader')
})

test('invite: errors when no pacts', async (t) => {
  const home = await tmpHome(t)
  const res = await runWithDir(home, ['invite'])
  t.not(res.exitCode, 0)
  t.ok(res.stderr.includes('no pacts at'))
})

test('join: refuses bad hex', async (t) => {
  const home = await tmpHome(t)
  const res = await runWithDir(home, ['join', 'not-hex'])
  t.not(res.exitCode, 0)
  t.ok(res.stderr.includes('must be hex'))
})
