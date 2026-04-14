const createTestnet = require('hyperdht/testnet')
const { tmpDaemon } = require('./tmp-daemon')

async function pair(t, opts = {}) {
  const testnet = await createTestnet(3, t.teardown)
  const swarmOpts = { bootstrap: testnet.bootstrap }

  const a = await tmpDaemon(t, { swarm: swarmOpts, ...opts.a })
  const b = await tmpDaemon(t, {
    swarm: swarmOpts,
    joinKey: a.daemon.pactKey,
    ...opts.b,
  })

  await a.daemon.waitForConnections(1, { timeout: 10000 })
  await b.daemon.waitForConnections(1, { timeout: 10000 })

  return { a, b, testnet }
}

async function swarmOf(t, n, opts = {}) {
  if (n < 2) throw new Error('swarmOf requires n >= 2')
  const testnet = await createTestnet(Math.max(3, n), t.teardown)
  const swarmOpts = { bootstrap: testnet.bootstrap }

  const first = await tmpDaemon(t, { swarm: swarmOpts, ...opts.first })
  const others = []
  for (let i = 1; i < n; i++) {
    others.push(
      await tmpDaemon(t, {
        swarm: swarmOpts,
        joinKey: first.daemon.pactKey,
        ...opts.others,
      }),
    )
  }
  // Wait for everyone to see at least one peer.
  await Promise.all(
    [first, ...others].map((d) => d.daemon.waitForConnections(1, { timeout: 10000 })),
  )
  return { all: [first, ...others], first, others, testnet }
}

module.exports = { pair, swarmOf }
