import test from 'brittle'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import {
  writePidFile,
  readPidFile,
  removePidFile,
  isAlive,
  pidFileLooksAlive,
  pidPath,
} from '../../src/lib/pid'

async function tmpDir(t: any): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openpact-cli-pid-'))
  t.teardown(() => fs.rm(dir, { recursive: true, force: true }))
  return dir
}

test('readPidFile: missing file returns null', async (t) => {
  const dir = await tmpDir(t)
  t.is(await readPidFile(dir), null)
})

test('writePidFile + readPidFile round-trip', async (t) => {
  const dir = await tmpDir(t)
  await writePidFile(dir, 12345)
  t.is(await readPidFile(dir), 12345)
})

test('writePidFile: creates directory if missing', async (t) => {
  const base = await tmpDir(t)
  const nested = path.join(base, 'nested', 'deep')
  await writePidFile(nested, 42)
  const stat = await fs.stat(pidPath(nested))
  t.ok(stat.isFile())
})

test('removePidFile: deletes existing', async (t) => {
  const dir = await tmpDir(t)
  await writePidFile(dir, 42)
  await removePidFile(dir)
  t.is(await readPidFile(dir), null)
})

test('removePidFile: missing is a no-op', async (t) => {
  const dir = await tmpDir(t)
  await t.execution(() => removePidFile(dir))
})

test('readPidFile: garbage content returns null', async (t) => {
  const dir = await tmpDir(t)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(pidPath(dir), 'not a number', 'utf8')
  t.is(await readPidFile(dir), null)
})

test('isAlive: own process is alive', (t) => {
  t.is(isAlive(process.pid), true)
})

test('isAlive: clearly-dead PID is not alive', (t) => {
  // PID 999_999 is unlikely to exist on any reasonable system.
  t.is(isAlive(999_999), false)
})

test('pidFileLooksAlive: missing file → false', async (t) => {
  const dir = await tmpDir(t)
  t.is(await pidFileLooksAlive(dir), false)
})

test('pidFileLooksAlive: own pid → true', async (t) => {
  const dir = await tmpDir(t)
  await writePidFile(dir, process.pid)
  t.is(await pidFileLooksAlive(dir), true)
})

test('pidFileLooksAlive: stale pid → false', async (t) => {
  const dir = await tmpDir(t)
  await writePidFile(dir, 999_999)
  t.is(await pidFileLooksAlive(dir), false)
})
