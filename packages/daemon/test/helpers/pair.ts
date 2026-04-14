import createTestnet from 'hyperdht/testnet'
import { tmpDaemon, type TmpDaemonResult, type TmpDaemonOpts } from './tmp-daemon'

export interface PairOpts {
  a?: TmpDaemonOpts
  b?: TmpDaemonOpts
}

export interface PairResult {
  a: TmpDaemonResult
  b: TmpDaemonResult
  testnet: any
}

export async function pair(t: any, opts: PairOpts = {}): Promise<PairResult> {
  const testnet = await createTestnet(3, t.teardown)
  const swarmOpts = { bootstrap: testnet.bootstrap }

  const a = await tmpDaemon(t, { swarm: swarmOpts, ...opts.a })
  const b = await tmpDaemon(t, {
    swarm: swarmOpts,
    joinKey: a.daemon.pactKey!,
    ...opts.b,
  })

  await a.daemon.waitForConnections(1, { timeout: 10000 })
  await b.daemon.waitForConnections(1, { timeout: 10000 })

  return { a, b, testnet }
}

export interface SwarmOpts {
  first?: TmpDaemonOpts
  others?: TmpDaemonOpts
}

export interface SwarmResult {
  all: TmpDaemonResult[]
  first: TmpDaemonResult
  others: TmpDaemonResult[]
  testnet: any
}

export async function swarmOf(t: any, n: number, opts: SwarmOpts = {}): Promise<SwarmResult> {
  if (n < 2) throw new Error('swarmOf requires n >= 2')
  const testnet = await createTestnet(Math.max(3, n), t.teardown)
  const swarmOpts = { bootstrap: testnet.bootstrap }

  const first = await tmpDaemon(t, { swarm: swarmOpts, ...opts.first })
  const others: TmpDaemonResult[] = []
  for (let i = 1; i < n; i++) {
    others.push(
      await tmpDaemon(t, {
        swarm: swarmOpts,
        joinKey: first.daemon.pactKey!,
        ...opts.others,
      }),
    )
  }
  await Promise.all(
    [first, ...others].map((d) => d.daemon.waitForConnections(1, { timeout: 10000 })),
  )
  return { all: [first, ...others], first, others, testnet }
}
