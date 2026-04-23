import test from 'brittle'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { detectPlatform, isWsl2 } from '../../../src/lib/service/platform'

async function tmpFile(t: any, body: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openpact-platform-'))
  t.teardown(() => fs.rm(dir, { recursive: true, force: true }))
  const p = path.join(dir, 'version')
  await fs.writeFile(p, body)
  return p
}

test('detectPlatform: darwin → launchd, never WSL', (t) => {
  const p = detectPlatform({ platform: 'darwin' })
  t.is(p?.supervisor, 'launchd')
  t.is(p?.isWsl2, false)
})

test('detectPlatform: linux → systemd, WSL false when /proc/version is bare linux', async (t) => {
  const file = await tmpFile(t, 'Linux version 6.8.0-40-generic (buildd@ubuntu) ...')
  const p = detectPlatform({ platform: 'linux', procVersionPath: file })
  t.is(p?.supervisor, 'systemd')
  t.is(p?.isWsl2, false)
})

test('detectPlatform: linux + microsoft+wsl kernel → WSL2 true', async (t) => {
  const file = await tmpFile(
    t,
    'Linux version 6.6.87.2-microsoft-standard-WSL2 (oe-user@oe-host) ...',
  )
  const p = detectPlatform({ platform: 'linux', procVersionPath: file })
  t.is(p?.supervisor, 'systemd')
  t.is(p?.isWsl2, true)
})

test('detectPlatform: unsupported platform → null', (t) => {
  t.is(detectPlatform({ platform: 'win32' }), null)
  t.is(detectPlatform({ platform: 'freebsd' }), null)
})

test('isWsl2: missing file is false, not a throw', (t) => {
  t.is(isWsl2('/nonexistent/path/version'), false)
})
