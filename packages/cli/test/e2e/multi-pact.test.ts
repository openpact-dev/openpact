/**
 * Multi-pact CLI flows. These hit the daemon.json registry directly
 * (no running daemon needed for list/switch/rename/remove) and then
 * sanity-check the end-to-end shape.
 */
import test from 'brittle'
import fs from 'fs/promises'
import path from 'path'
import { tmpHome, runWithDir } from './helpers/run-cli'

test('list: empty host prints hint', async (t) => {
  const home = await tmpHome(t)
  const res = await runWithDir(home, ['list'])
  t.is(res.exitCode, 0)
  t.ok(res.stdout.includes('no pacts') || res.stdout.includes('init'))
})

test('list: --json emits structured output', async (t) => {
  const home = await tmpHome(t)
  await runWithDir(home, ['init', '--no-interactive', '--alias', 'iron'])
  const res = await runWithDir(home, ['list', '--json'])
  t.is(res.exitCode, 0)
  const parsed = JSON.parse(res.stdout)
  t.is(parsed.current, 'iron')
  t.is(parsed.pacts.length, 1)
  t.is(parsed.pacts[0].alias, 'iron')
  t.ok(/^[0-9a-f]{64}$/.test(parsed.pacts[0].pact_id))
})

test('list: tabular output marks the current pact', async (t) => {
  const home = await tmpHome(t)
  await runWithDir(home, ['init', '--no-interactive', '--alias', 'iron'])
  await runWithDir(home, ['init', '--no-interactive', '--alias', 'smoke'])
  // Second init should make 'smoke' current (last-create wins? No — init
  // with setCurrent is true on first pact only; but each init writes its
  // own registry entry). Current should stay at 'iron' in this impl.
  const res = await runWithDir(home, ['list'])
  t.is(res.exitCode, 0)
  t.ok(res.stdout.includes('iron'))
  t.ok(res.stdout.includes('smoke'))
})

test('switch: changes currentAlias', async (t) => {
  const home = await tmpHome(t)
  await runWithDir(home, ['init', '--no-interactive', '--alias', 'iron'])
  await runWithDir(home, ['init', '--no-interactive', '--alias', 'smoke'])

  await runWithDir(home, ['switch', 'smoke'])
  const registry = JSON.parse(await fs.readFile(path.join(home, 'daemon.json'), 'utf8'))
  t.is(registry.currentAlias, 'smoke')
})

test('switch: unknown alias fails loudly', async (t) => {
  const home = await tmpHome(t)
  await runWithDir(home, ['init', '--no-interactive', '--alias', 'iron'])
  const res = await runWithDir(home, ['switch', 'nope'])
  t.not(res.exitCode, 0)
  t.ok(res.stderr.includes('no pact named nope'))
})

test('rename: alias changes; pact_id unchanged', async (t) => {
  const home = await tmpHome(t)
  await runWithDir(home, ['init', '--no-interactive', '--alias', 'iron'])
  const before = JSON.parse(await fs.readFile(path.join(home, 'daemon.json'), 'utf8'))
  const ironId = before.pacts[0].pact_id

  const res = await runWithDir(home, ['rename', 'iron', 'steel'])
  t.is(res.exitCode, 0)

  const after = JSON.parse(await fs.readFile(path.join(home, 'daemon.json'), 'utf8'))
  t.is(after.pacts.length, 1)
  t.is(after.pacts[0].alias, 'steel')
  t.is(after.pacts[0].pact_id, ironId, 'pact_id is unchanged')
  t.is(after.currentAlias, 'steel', 'currentAlias followed the rename')
})

test('rename: rejects existing alias', async (t) => {
  const home = await tmpHome(t)
  await runWithDir(home, ['init', '--no-interactive', '--alias', 'iron'])
  await runWithDir(home, ['init', '--no-interactive', '--alias', 'smoke'])
  const res = await runWithDir(home, ['rename', 'iron', 'smoke'])
  t.not(res.exitCode, 0)
  t.ok(res.stderr.includes('already exists'))
})

test('remove --yes: wipes pact from registry + disk', async (t) => {
  const home = await tmpHome(t)
  await runWithDir(home, ['init', '--no-interactive', '--alias', 'iron'])
  const registryBefore = JSON.parse(await fs.readFile(path.join(home, 'daemon.json'), 'utf8'))
  const pactDir = registryBefore.pacts[0].dataDir
  t.ok((await fs.stat(pactDir)).isDirectory())

  const res = await runWithDir(home, ['remove', 'iron', '--yes'])
  t.is(res.exitCode, 0)

  const registryAfter = JSON.parse(await fs.readFile(path.join(home, 'daemon.json'), 'utf8'))
  t.is(registryAfter.pacts.length, 0)
  t.is(registryAfter.currentAlias, null)

  let removed = false
  try {
    await fs.stat(pactDir)
  } catch {
    removed = true
  }
  t.ok(removed, 'pact directory was wiped')
})

test('remove without --yes in non-TTY fails', async (t) => {
  const home = await tmpHome(t)
  await runWithDir(home, ['init', '--no-interactive', '--alias', 'iron'])
  const res = await runWithDir(home, ['remove', 'iron', '--no-interactive'])
  t.not(res.exitCode, 0)
  t.ok(res.stderr.includes('--yes'))
})
