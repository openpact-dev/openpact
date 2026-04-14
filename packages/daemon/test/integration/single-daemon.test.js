const test = require('brittle')
const { tmpDaemon } = require('../helpers/tmp-daemon')

test('Daemon.create initialises with creator role and a pact key', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  t.is(daemon.role, 'creator')
  t.ok(/^[0-9a-f]+$/.test(daemon.pactKey), 'pactKey is hex')
  t.ok(/^[0-9a-f]+$/.test(daemon.publicKey), 'publicKey is hex')
  t.ok(/^anon-[a-z]+-[0-9a-f]{4}$/.test(daemon.peerHandle))
})

test('Daemon.create + append + view contains entry', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  await daemon.append({
    type: 'knowledge',
    timestamp: new Date().toISOString(),
    agent_id: daemon.peerHandle,
    payload: { topic: 'sales', content: 'discovery' },
  })
  await daemon.update()
  await daemon.waitForViewVersion(1, { timeout: 2000 })
  t.ok(daemon.viewVersion >= 1)
})

test('Daemon.load resumes from disk', async (t) => {
  const { daemon, dir } = await tmpDaemon(t, { start: false })
  const originalPactKey = daemon.pactKey
  await daemon.stop()

  const { Daemon } = require('../../src/daemon')
  const resumed = await Daemon.load({ dataDir: dir })
  t.teardown(() => resumed.stop())
  t.is(resumed.pactKey, originalPactKey)
  t.is(resumed.role, 'creator')
})

test('Daemon.load throws when no pact exists', async (t) => {
  const fs = require('fs/promises')
  const os = require('os')
  const path = require('path')
  const { Daemon } = require('../../src/daemon')
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openpact-empty-'))
  t.teardown(() => fs.rm(dir, { recursive: true, force: true }))
  await t.exception(() => Daemon.load({ dataDir: dir }), /no pact found/)
})
