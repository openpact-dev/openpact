import test from 'brittle'
import fs from 'fs/promises'
import path from 'path'
import { tmpHome, runWithDir } from './helpers/run-cli'

test('openpact init creates ~/.openpact/ with a pact registry', async (t) => {
  const home = await tmpHome(t)
  const res = await runWithDir(home, ['init'])
  t.is(res.exitCode, 0)
  t.ok(res.stdout.includes('pact has been sealed'))
  t.ok(res.stdout.includes('Pact key'))

  const daemonCfg = JSON.parse(await fs.readFile(path.join(home, 'daemon.json'), 'utf8'))
  t.is(daemonCfg.pacts.length, 1)
  t.ok(daemonCfg.currentAlias, 'registry has a currentAlias')
  const pactDir = daemonCfg.pacts[0].dataDir
  const pactCfg = JSON.parse(await fs.readFile(path.join(pactDir, 'config.json'), 'utf8'))
  t.ok(typeof pactCfg.pactKey === 'string')
  t.is(pactCfg.role, 'creator')
})

test('openpact init: refuses second init at same alias without --force', async (t) => {
  const home = await tmpHome(t)
  await runWithDir(home, ['init', '--alias', 'iron'])
  const res = await runWithDir(home, ['init', '--alias', 'iron'])
  t.not(res.exitCode, 0)
  t.ok(res.stderr.includes('already exists'))
})

test('openpact init: --force replaces the same alias', async (t) => {
  const home = await tmpHome(t)
  await runWithDir(home, ['init', '--alias', 'iron'])
  const beforeCfg = JSON.parse(await fs.readFile(path.join(home, 'daemon.json'), 'utf8'))
  const beforeId = beforeCfg.pacts[0].pactId

  const res = await runWithDir(home, ['init', '--alias', 'iron', '--force'])
  t.is(res.exitCode, 0)

  const afterCfg = JSON.parse(await fs.readFile(path.join(home, 'daemon.json'), 'utf8'))
  t.is(afterCfg.pacts.length, 1)
  t.not(beforeId, afterCfg.pacts[0].pactId, 'new pact key after --force')
})
