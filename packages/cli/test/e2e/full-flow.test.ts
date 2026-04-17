import test from 'brittle'
import createTestnet from 'hyperdht/testnet'
import net from 'net'
import { tmpHome, runCli, authHeaders } from './helpers/run-cli'
import { readPidFile, isAlive } from '../../src/lib/pid'

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

test(
  'full flow: A creates pact, B joins; A admits B; B writes; A sees',
  { timeout: 90_000 },
  async (t) => {
    // Spin up an in-memory DHT testnet so the two daemons find each other
    // without touching the public network.
    const testnet = await createTestnet(3, t.teardown)
    const bootstrap = testnet.bootstrap.map((b: any) => `${b.host}:${b.port}`).join(',')

    const homeA = await tmpHome(t)
    const homeB = await tmpHome(t)
    const portA = await getFreePort()
    const portB = await getFreePort()

    // A: init + start with the testnet bootstrap. Pin alias to
    // "default" so the REST URLs below stay stable (auto-slug from
    // the themed pact name would otherwise pick something random).
    await runCli(['--data-dir', homeA, 'init', '--alias', 'default'])
    await runCli([
      '--data-dir',
      homeA,
      'start',
      '--no-dashboard',
      '--port',
      String(portA),
      '--bootstrap',
      bootstrap,
    ])
    const pidA = await readPidFile(homeA)
    t.teardown(() => ensureKilled(pidA))
    t.teardown(() => runCli(['--data-dir', homeA, 'stop']).catch(() => {}))

    // A: invite → share URL carrying a one-time token
    const inv = await runCli(['--data-dir', homeA, 'invite', '--port', String(portA)])
    const inviteOut = inv.stdout.trim()
    const token = inviteOut.startsWith('http')
      ? (new URL(inviteOut).searchParams.get('invite') ?? '')
      : inviteOut
    t.ok(token.length > 0, 'invite emitted a redeemable token')

    // B: seed a local host with one pact so `start` has a registry to load,
    // then join the real pact into that running host.
    await runCli(['--data-dir', homeB, 'init', '--alias', 'scratch'])
    await runCli([
      '--data-dir',
      homeB,
      'start',
      '--no-dashboard',
      '--port',
      String(portB),
      '--bootstrap',
      bootstrap,
    ])
    const pidB = await readPidFile(homeB)
    t.teardown(() => ensureKilled(pidB))
    t.teardown(() => runCli(['--data-dir', homeB, 'stop']).catch(() => {}))

    await waitForPing(`http://127.0.0.1:${portA}`)
    await waitForPing(`http://127.0.0.1:${portB}`)

    const join = await runCli([
      '--data-dir',
      homeB,
      'join',
      token,
      '--no-interactive',
      '--alias',
      'default',
      '--port',
      String(portB),
    ])
    const joined = JSON.parse(join.stdout || '{}') as {
      alias?: string
      pact_id?: string
      member?: boolean
      peer_handle?: string
    }
    t.is(join.stderr, '')
    t.is(joined.alias, 'default', `join output: ${join.stdout}`)
    t.is(joined.member, true, `join output: ${join.stdout}`)

    // Get B's member public key from its status so later assertions can
    // match the author identity shown in A's log.
    let bStatus: { public_key: string; peer_handle: string } = {
      public_key: '',
      peer_handle: '',
    }
    const bDeadline = Date.now() + 5000
    const headersB = await authHeaders(homeB)
    while (Date.now() < bDeadline) {
      const bStatusRes = await fetch(`http://127.0.0.1:${portB}/v1/pacts/default/status`, {
        headers: headersB,
      })
      bStatus = (await bStatusRes.json()) as { public_key: string; peer_handle: string }
      if (bStatus.public_key && /^[0-9a-f]{64}$/.test(bStatus.public_key)) break
      await new Promise((r) => setTimeout(r, 100))
    }
    t.ok(/^[0-9a-f]{64}$/.test(bStatus.public_key), 'B reports a 64-hex public key')

    // The redeem path should have already formed the live swarm connection.
    const agentsDeadline = Date.now() + 15_000
    let aAgents: number = 0
    const headersA = await authHeaders(homeA)
    while (Date.now() < agentsDeadline) {
      const aStatus = (await (
        await fetch(`http://127.0.0.1:${portA}/v1/pacts/default/status`, { headers: headersA })
      ).json()) as {
        agents: number
      }
      aAgents = aStatus.agents
      if (aAgents >= 1) break
      await new Promise((r) => setTimeout(r, 200))
    }
    t.ok(aAgents >= 1, 'A sees B as an agent')

    // Join already redeemed the invite, so B should be writable without a
    // second manual admission step.
    const writableDeadline = Date.now() + 30_000
    let bIsMember = false
    while (Date.now() < writableDeadline) {
      const bs = (await (
        await fetch(`http://127.0.0.1:${portB}/v1/pacts/default/status`, { headers: headersB })
      ).json()) as {
        is_member: boolean
      }
      if (bs.is_member) {
        bIsMember = true
        break
      }
      await new Promise((r) => setTimeout(r, 200))
    }
    t.ok(bIsMember, 'B is now a member')

    const post = await fetch(`http://127.0.0.1:${portB}/v1/pacts/default/knowledge`, {
      method: 'POST',
      headers: { ...headersB, 'content-type': 'application/json' },
      body: JSON.stringify({ topic: 'two-daemon', content: 'B wrote this; A should see it' }),
    })
    t.is(post.status, 200, 'B POST succeeded')

    // Wait for A's openpact log to surface B's entry.
    const logDeadline = Date.now() + 30_000
    let aLog = ''
    while (Date.now() < logDeadline) {
      const out = await runCli(['--data-dir', homeA, 'log', '--port', String(portA)])
      aLog = out.stdout
      if (aLog.includes('B wrote this')) break
      await new Promise((r) => setTimeout(r, 250))
    }
    t.ok(aLog.includes('B wrote this'), 'A sees B entry via openpact log')
    t.ok(aLog.includes(bStatus.peer_handle), `log line shows B's handle`)
  },
)

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
