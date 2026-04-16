import test from 'brittle'
import createTestnet from 'hyperdht/testnet'
import fs from 'fs/promises'
import net from 'net'
import path from 'path'
import { tmpHome, runWithDir } from './helpers/run-cli'
import { readPidFile, isAlive } from '../../src/lib/pid'

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

async function pactConfig(hostDir: string, alias: string): Promise<any> {
  const daemonCfg = JSON.parse(await fs.readFile(path.join(hostDir, 'daemon.json'), 'utf8'))
  const entry = daemonCfg.pacts.find((p: any) => p.alias === alias)
  return JSON.parse(await fs.readFile(path.join(entry.dataDir, 'config.json'), 'utf8'))
}

async function ensureKilled(pid: number | null) {
  if (pid && isAlive(pid)) {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      /* gone */
    }
  }
}

async function waitForPing(base: string, timeout = 15_000): Promise<void> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/v1/ping`)
      if (res.ok) return
    } catch {
      /* keep polling */
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`daemon at ${base} did not become reachable within ${timeout}ms`)
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        server.close(() => reject(new Error('failed to allocate free port')))
        return
      }
      const { port } = addr
      server.close((err) => (err ? reject(err) : resolve(port)))
    })
    server.on('error', reject)
  })
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
  const testnet = await createTestnet(3, t.teardown)
  const bootstrap = testnet.bootstrap.map((node: any) => `${node.host}:${node.port}`).join(',')
  const portA = await getFreePort()
  const portB = await getFreePort()

  await runWithDir(a, ['init', '--no-interactive', '--name', 'A', '--display-name', 'Creator'])
  await runWithDir(a, [
    'start',
    '--no-dashboard',
    '--port',
    String(portA),
    '--bootstrap',
    bootstrap,
  ])
  const pidA = await readPidFile(a)
  t.teardown(() => ensureKilled(pidA))
  t.teardown(() => runWithDir(a, ['stop']).catch(() => {}))
  await waitForPing(`http://127.0.0.1:${portA}`)

  const inv = await runWithDir(a, ['invite', '--port', String(portA)])
  const inviteOut = inv.stdout.trim()
  const token = inviteOut.startsWith('http')
    ? (new URL(inviteOut).searchParams.get('invite') ?? '')
    : inviteOut
  t.ok(token.length > 0, 'invite emitted a redeemable token')

  await runWithDir(b, ['init', '--no-interactive', '--alias', 'scratch'])
  await runWithDir(b, [
    'start',
    '--no-dashboard',
    '--port',
    String(portB),
    '--bootstrap',
    bootstrap,
  ])
  const pidB = await readPidFile(b)
  t.teardown(() => ensureKilled(pidB))
  t.teardown(() => runWithDir(b, ['stop']).catch(() => {}))
  await waitForPing(`http://127.0.0.1:${portB}`)

  const res = await runWithDir(b, [
    'join',
    token,
    '--no-interactive',
    '--display-name',
    'Joiner',
    '--alias',
    'default',
    '--port',
    String(portB),
  ])
  t.is(res.stderr, '')
  const joined = JSON.parse(res.stdout || '{}') as { alias?: string; member?: boolean }
  t.is(joined.alias, 'default')
  t.is(joined.member, true)

  const cfg = await pactConfig(b, 'default')
  t.is(cfg.displayName, 'Joiner')
  t.is(cfg.role, null)
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
