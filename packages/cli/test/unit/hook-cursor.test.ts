import test from 'brittle'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { cursorPath, readCursor, writeCursor } from '../../src/lib/hook-cursor'

async function tmpDir(t: any): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openpact-hook-cursor-'))
  t.teardown(() => fs.rm(dir, { recursive: true, force: true }))
  return dir
}

test('cursorPath: stable for same cwd+pact', (t) => {
  const a = cursorPath('/host', '/project', 'alpha')
  const b = cursorPath('/host', '/project', 'alpha')
  t.is(a, b)
  t.ok(a.startsWith(path.join('/host', 'hooks')))
  t.ok(a.endsWith('.json'))
})

test('cursorPath: different pact → different path', (t) => {
  t.unlike(cursorPath('/host', '/project', 'alpha'), cursorPath('/host', '/project', 'beta'))
})

test('cursorPath: different cwd → different path', (t) => {
  t.unlike(cursorPath('/host', '/project/a', 'p'), cursorPath('/host', '/project/b', 'p'))
})

test('readCursor: missing file → null', async (t) => {
  const dir = await tmpDir(t)
  t.is(await readCursor(path.join(dir, 'nope.json')), null)
})

test('readCursor: malformed JSON → null (not fatal)', async (t) => {
  const dir = await tmpDir(t)
  const file = path.join(dir, 'c.json')
  await fs.writeFile(file, '{nope', 'utf8')
  t.is(await readCursor(file), null)
})

test('readCursor: wrong shape → null', async (t) => {
  const dir = await tmpDir(t)
  const file = path.join(dir, 'c.json')
  await fs.writeFile(file, JSON.stringify({ only: 'stuff' }), 'utf8')
  t.is(await readCursor(file), null)
})

test('writeCursor + readCursor round trip', async (t) => {
  const dir = await tmpDir(t)
  const file = cursorPath(dir, '/my/project', 'alpha')
  await writeCursor(file, { lastSeen: '2026-04-17T00:00:00Z', pactId: 'alpha', cwd: '/my/project' })
  const out = await readCursor(file)
  t.ok(out)
  t.is(out!.lastSeen, '2026-04-17T00:00:00Z')
  t.is(out!.pactId, 'alpha')
  t.is(out!.cwd, '/my/project')
})

test('writeCursor: creates hooks/ dir if missing', async (t) => {
  const dir = await tmpDir(t)
  const file = cursorPath(dir, '/p', 'a')
  await writeCursor(file, { lastSeen: 'x', pactId: 'a', cwd: '/p' })
  const stat = await fs.stat(path.join(dir, 'hooks'))
  t.ok(stat.isDirectory())
})
