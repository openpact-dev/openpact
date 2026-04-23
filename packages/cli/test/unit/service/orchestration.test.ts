import test from 'brittle'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import {
  install,
  uninstall,
  status,
  logs,
  assertBinUsable,
  type Platform,
  type Runner,
} from '../../../src/lib/service'

type RunCall = { bin: string; args: string[] }

function fakeRunner(
  impls: Partial<Record<string, (args: string[]) => { stdout?: string; stderr?: string; code?: number }>>,
): { run: Runner; calls: RunCall[] } {
  const calls: RunCall[] = []
  const run: Runner = async (bin, args) => {
    calls.push({ bin, args })
    const impl = impls[bin]
    const res = impl ? impl(args) : {}
    return { stdout: res.stdout ?? '', stderr: res.stderr ?? '', code: res.code ?? 0 }
  }
  return { run, calls }
}

async function tmpHome(t: any): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openpact-svc-home-'))
  t.teardown(() => fs.rm(dir, { recursive: true, force: true }))
  return dir
}

const systemd: Platform = { supervisor: 'systemd', isWsl2: false }
const systemdWsl: Platform = { supervisor: 'systemd', isWsl2: true }
const launchd: Platform = { supervisor: 'launchd', isWsl2: false }

test('install systemd: writes unit, reloads, enables --now', async (t) => {
  const home = await tmpHome(t)
  const { run, calls } = fakeRunner({})
  const result = await install(
    {
      binPath: '/usr/local/bin/openpact',
      dataDir: '/home/alice/.openpact',
      extraArgs: ['--port', '7777'],
    },
    { run, home, platform: systemd },
  )

  t.is(result.platform.supervisor, 'systemd')
  t.is(result.started, true)
  t.is(result.linger, undefined, 'non-wsl2 hosts skip linger')

  const unit = await fs.readFile(result.unitPath, 'utf8')
  t.ok(unit.includes('ExecStart=/usr/local/bin/openpact start --foreground --port 7777'))
  t.ok(unit.includes('Environment=OPENPACT_DATA_DIR=/home/alice/.openpact'))

  // daemon-reload first, then enable --now. No loginctl on non-wsl2.
  t.alike(
    calls.map((c) => [c.bin, c.args.join(' ')]),
    [
      ['systemctl', '--user daemon-reload'],
      ['systemctl', '--user enable --now openpact.service'],
    ],
  )
})

test('install systemd on wsl2: tries loginctl enable-linger', async (t) => {
  const home = await tmpHome(t)
  const { run, calls } = fakeRunner({ loginctl: () => ({ code: 0 }) })
  const result = await install(
    { binPath: '/usr/local/bin/openpact', dataDir: '/home/alice/.openpact' },
    { run, home, platform: systemdWsl },
  )

  t.is(result.linger?.attempted, true)
  t.is(result.linger?.ok, true)
  t.ok(
    calls.some((c) => c.bin === 'loginctl' && c.args[0] === 'enable-linger'),
    'loginctl was invoked',
  )
})

test('install systemd on wsl2: linger failure is non-fatal', async (t) => {
  const home = await tmpHome(t)
  const { run } = fakeRunner({ loginctl: () => ({ code: 1, stderr: 'no permission' }) })
  const result = await install(
    { binPath: '/usr/local/bin/openpact', dataDir: '/home/alice/.openpact' },
    { run, home, platform: systemdWsl },
  )
  t.is(result.linger?.ok, false)
  t.is(result.linger?.message, 'no permission')
  t.is(result.started, true, 'install still proceeds')
})

test('install systemd: enable failure surfaces as startError and exits non-zero', async (t) => {
  const home = await tmpHome(t)
  const { run } = fakeRunner({
    systemctl: (args) => {
      if (args[1] === 'enable') return { code: 5, stderr: 'Failed to enable' }
      return { code: 0 }
    },
  })
  const result = await install(
    { binPath: '/usr/local/bin/openpact', dataDir: '/home/alice/.openpact' },
    { run, home, platform: systemd },
  )
  t.is(result.started, false)
  t.is(result.startError, 'Failed to enable')
  const unitWritten = await fs
    .access(result.unitPath)
    .then(() => true)
    .catch(() => false)
  t.is(unitWritten, true, 'unit stays written even when enable fails')
})

test('install launchd: writes plist, unload then load -w', async (t) => {
  const home = await tmpHome(t)
  const dataDir = path.join(home, '.openpact')
  const { run, calls } = fakeRunner({ launchctl: () => ({ code: 0 }) })
  const result = await install(
    {
      binPath: '/usr/local/bin/openpact',
      dataDir,
      extraArgs: ['--no-dashboard'],
    },
    { run, home, platform: launchd },
  )

  t.is(result.platform.supervisor, 'launchd')
  t.is(result.started, true)

  const plist = await fs.readFile(result.unitPath, 'utf8')
  t.ok(plist.includes('<string>dev.openpact.daemon</string>'))
  t.ok(plist.includes('<string>--no-dashboard</string>'))

  t.alike(
    calls.map((c) => [c.bin, c.args.join(' ')]),
    [
      ['launchctl', `unload ${result.unitPath}`],
      ['launchctl', `load -w ${result.unitPath}`],
    ],
  )
})

test('install launchd: load failure surfaces startError', async (t) => {
  const home = await tmpHome(t)
  const dataDir = path.join(home, '.openpact')
  const { run } = fakeRunner({
    launchctl: (args) => {
      if (args[0] === 'load') return { code: 1, stderr: 'boot-out required' }
      return { code: 0 }
    },
  })
  const result = await install(
    { binPath: '/usr/local/bin/openpact', dataDir },
    { run, home, platform: launchd },
  )
  t.is(result.started, false)
  t.is(result.startError, 'boot-out required')
})

test('uninstall systemd: stops, disables, unlinks, daemon-reloads', async (t) => {
  const home = await tmpHome(t)
  const unitDir = path.join(home, '.config', 'systemd', 'user')
  await fs.mkdir(unitDir, { recursive: true })
  const unitPath = path.join(unitDir, 'openpact.service')
  await fs.writeFile(unitPath, 'stub')

  const { run, calls } = fakeRunner({})
  const result = await uninstall({ run, home, platform: systemd })

  t.is(result.removed, true)
  t.is(result.unitPath, unitPath)
  const still = await fs.access(unitPath).then(
    () => true,
    () => false,
  )
  t.is(still, false, 'unit file gone')
  t.alike(
    calls.map((c) => [c.bin, c.args.join(' ')]),
    [
      ['systemctl', '--user stop openpact.service'],
      ['systemctl', '--user disable openpact.service'],
      ['systemctl', '--user daemon-reload'],
    ],
  )
})

test('uninstall systemd: missing unit → removed=false, no throw', async (t) => {
  const home = await tmpHome(t)
  const { run } = fakeRunner({})
  const result = await uninstall({ run, home, platform: systemd })
  t.is(result.removed, false)
})

test('uninstall launchd: unload + remove + unlink', async (t) => {
  const home = await tmpHome(t)
  const agentDir = path.join(home, 'Library', 'LaunchAgents')
  await fs.mkdir(agentDir, { recursive: true })
  const plistPath = path.join(agentDir, 'dev.openpact.daemon.plist')
  await fs.writeFile(plistPath, 'stub')

  const { run, calls } = fakeRunner({})
  const result = await uninstall({ run, home, platform: launchd })
  t.is(result.removed, true)
  const stub = calls.map((c) => `${c.bin} ${c.args.join(' ')}`)
  t.ok(stub.some((s) => s.startsWith('launchctl unload')))
  t.ok(stub.some((s) => s === 'launchctl remove dev.openpact.daemon'))
})

test('status systemd: is-active → active, status → detail', async (t) => {
  const home = await tmpHome(t)
  const unitDir = path.join(home, '.config', 'systemd', 'user')
  await fs.mkdir(unitDir, { recursive: true })
  await fs.writeFile(path.join(unitDir, 'openpact.service'), 'stub')

  const { run } = fakeRunner({
    systemctl: (args) => {
      if (args[1] === 'is-active') return { code: 0 }
      if (args[1] === 'is-enabled') return { code: 0 }
      if (args[1] === 'status') return { code: 0, stdout: 'active (running)' }
      return { code: 0 }
    },
  })
  const s = await status({ run, home, platform: systemd })
  t.is(s.installed, true)
  t.is(s.active, true)
  t.is(s.enabled, true)
  t.ok(s.detail.includes('active (running)'))
})

test('status systemd: missing unit + inactive reports cleanly', async (t) => {
  const home = await tmpHome(t)
  const { run } = fakeRunner({
    systemctl: (args) => {
      if (args[1] === 'is-active') return { code: 3 }
      if (args[1] === 'is-enabled') return { code: 1 }
      return { code: 3 }
    },
  })
  const s = await status({ run, home, platform: systemd })
  t.is(s.installed, false)
  t.is(s.active, false)
  t.is(s.enabled, null)
})

test('status launchd: active when launchctl list mentions PID', async (t) => {
  const home = await tmpHome(t)
  const agentDir = path.join(home, 'Library', 'LaunchAgents')
  await fs.mkdir(agentDir, { recursive: true })
  await fs.writeFile(path.join(agentDir, 'dev.openpact.daemon.plist'), 'stub')

  const { run } = fakeRunner({
    launchctl: () => ({ code: 0, stdout: '{ "PID" = 1234; "Label" = "dev.openpact.daemon"; };' }),
  })
  const s = await status({ run, home, platform: launchd })
  t.is(s.installed, true)
  t.is(s.active, true)
  t.is(s.enabled, true)
})

test('logs systemd: forwards --lines to journalctl', async (t) => {
  const home = await tmpHome(t)
  const { run, calls } = fakeRunner({
    journalctl: () => ({ code: 0, stdout: 'line one\nline two\n' }),
  })
  const out = await logs(50, { run, home, platform: systemd })
  t.is(out, 'line one\nline two\n')
  t.is(calls[0].bin, 'journalctl')
  t.ok(calls[0].args.includes('50'))
})

test('logs systemd: non-zero + empty stdout throws', async (t) => {
  const home = await tmpHome(t)
  const { run } = fakeRunner({
    journalctl: () => ({ code: 1, stderr: 'no such unit' }),
  })
  await t.exception(() => logs(10, { run, home, platform: systemd }), /no such unit/)
})

test('logs launchd: reads tail of the per-user log file', async (t) => {
  const home = await tmpHome(t)
  const dataDir = path.join(home, '.openpact')
  const logDir = path.join(dataDir, 'logs')
  await fs.mkdir(logDir, { recursive: true })
  await fs.writeFile(path.join(logDir, 'service.log'), ['a', 'b', 'c', 'd', 'e'].join('\n'))

  const originalEnv = process.env.OPENPACT_DATA_DIR
  process.env.OPENPACT_DATA_DIR = dataDir
  t.teardown(() => {
    if (originalEnv === undefined) delete process.env.OPENPACT_DATA_DIR
    else process.env.OPENPACT_DATA_DIR = originalEnv
  })

  const { run } = fakeRunner({})
  const out = await logs(3, { run, home, platform: launchd })
  t.is(out.trim(), 'c\nd\ne')
})

test('logs launchd: missing log file reports friendly message', async (t) => {
  const home = await tmpHome(t)
  const originalEnv = process.env.OPENPACT_DATA_DIR
  process.env.OPENPACT_DATA_DIR = path.join(home, '.openpact-empty')
  t.teardown(() => {
    if (originalEnv === undefined) delete process.env.OPENPACT_DATA_DIR
    else process.env.OPENPACT_DATA_DIR = originalEnv
  })

  const { run } = fakeRunner({})
  const out = await logs(10, { run, home, platform: launchd })
  t.ok(out.includes('no log file yet'))
})

test('assertBinUsable: rejects relative and TypeScript entries', (t) => {
  t.exception(() => assertBinUsable('openpact'), /absolute path/)
  t.exception(() => assertBinUsable('/path/to/bin.ts'), /TypeScript entry/)
  t.exception(() => assertBinUsable('/path/to/bin.mts'), /TypeScript entry/)
  t.execution(() => assertBinUsable('/usr/local/bin/openpact'))
})
