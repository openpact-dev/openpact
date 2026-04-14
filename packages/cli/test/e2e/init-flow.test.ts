import test from 'brittle'
import fs from 'fs/promises'
import path from 'path'
import { tmpHome, runWithDir } from './helpers/run-cli'

test('openpact init creates ~/.openpact/ with config', async (t) => {
  const home = await tmpHome(t)
  const res = await runWithDir(home, ['init'])
  t.is(res.exitCode, 0)
  t.ok(res.stdout.includes('pact has been sealed'))
  t.ok(res.stdout.includes('Pact key'))

  const cfg = JSON.parse(await fs.readFile(path.join(home, 'config.json'), 'utf8'))
  t.ok(typeof cfg.pactKey === 'string')
  t.is(cfg.role, 'creator')
})

test('openpact init: refuses second init without --force', async (t) => {
  const home = await tmpHome(t)
  await runWithDir(home, ['init'])
  const res = await runWithDir(home, ['init'])
  t.not(res.exitCode, 0)
  t.ok(res.stderr.includes('already sealed'))
})

test('openpact init: --force overwrites', async (t) => {
  const home = await tmpHome(t)
  await runWithDir(home, ['init'])
  const before = JSON.parse(await fs.readFile(path.join(home, 'config.json'), 'utf8'))

  const res = await runWithDir(home, ['init', '--force'])
  t.is(res.exitCode, 0)

  const after = JSON.parse(await fs.readFile(path.join(home, 'config.json'), 'utf8'))
  t.not(before.pactKey, after.pactKey, 'new keypair after --force')
})
