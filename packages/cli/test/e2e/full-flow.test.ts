import test from 'brittle'
import createTestnet from 'hyperdht/testnet'
import { tmpHome, runCli } from './helpers/run-cli'
import { readPidFile, isAlive } from '../../src/lib/pid'

let nextPort = 17600

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
  'full flow: A creates pact, B joins; A promotes B; B writes; A sees',
  { timeout: 90_000 },
  async (t) => {
    // Spin up an in-memory DHT testnet so the two daemons find each other
    // without touching the public network.
    const testnet = await createTestnet(3, t.teardown)
    const bootstrap = testnet.bootstrap.map((b: any) => `${b.host}:${b.port}`).join(',')

    const homeA = await tmpHome(t)
    const homeB = await tmpHome(t)
    const portA = nextPort++
    const portB = nextPort++

    // A: init + start with the testnet bootstrap.
    await runCli(['--data-dir', homeA, 'init'])
    await runCli([
      '--data-dir',
      homeA,
      'start',
      '--daemon',
      '--port',
      String(portA),
      '--bootstrap',
      bootstrap,
    ])
    const pidA = await readPidFile(homeA)
    t.teardown(() => ensureKilled(pidA))
    t.teardown(() => runCli(['--data-dir', homeA, 'stop']).catch(() => {}))

    // A: invite → key
    const inv = await runCli(['--data-dir', homeA, 'invite'])
    const key = inv.stdout.trim()
    t.ok(/^[0-9a-f]+$/.test(key), 'invite emitted a hex key')

    // B: join + start with the same bootstrap.
    await runCli(['--data-dir', homeB, 'join', key])
    await runCli([
      '--data-dir',
      homeB,
      'start',
      '--daemon',
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

    // Get B's writer public key from its status (so A can promote it).
    const bStatusRes = await fetch(`http://127.0.0.1:${portB}/v1/status`)
    const bStatus = (await bStatusRes.json()) as { public_key: string; peer_handle: string }
    t.ok(/^[0-9a-f]{64}$/.test(bStatus.public_key), 'B reports a 64-hex public key')

    // Wait for A to see B as a peer (so the admin entry can replicate).
    const peersDeadline = Date.now() + 15_000
    let aPeers: number = 0
    while (Date.now() < peersDeadline) {
      const aStatus = (await (await fetch(`http://127.0.0.1:${portA}/v1/status`)).json()) as {
        peers: number
      }
      aPeers = aStatus.peers
      if (aPeers >= 1) break
      await new Promise((r) => setTimeout(r, 200))
    }
    t.ok(aPeers >= 1, 'A sees B as a peer')

    // A promotes B as an indexer (so B can append; needed because the system
    // core needs quorum to advance signedLength when there are multiple writers).
    const promote = await runCli([
      '--data-dir',
      homeA,
      'add-writer',
      bStatus.public_key,
      '--indexer',
      '--port',
      String(portA),
    ])
    t.is(promote.exitCode, 0, 'add-writer succeeded')
    t.ok(promote.stdout.includes('pact-bearer is bound') || promote.stdout.includes('bound'))

    // Wait for B's autobase to recognise itself as writable, then have B post
    // a knowledge entry via its own REST API.
    const writableDeadline = Date.now() + 30_000
    let bIsWriter = false
    while (Date.now() < writableDeadline) {
      const bs = (await (await fetch(`http://127.0.0.1:${portB}/v1/status`)).json()) as {
        is_writer: boolean
      }
      if (bs.is_writer) {
        bIsWriter = true
        break
      }
      await new Promise((r) => setTimeout(r, 200))
    }
    t.ok(bIsWriter, 'B is now a writer')

    const post = await fetch(`http://127.0.0.1:${portB}/v1/knowledge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
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
