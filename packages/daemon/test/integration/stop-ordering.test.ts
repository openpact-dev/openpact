import test from 'brittle'
import { tmpDaemon } from '../helpers/tmp-daemon'

// The ordered Daemon.stop sequence (Phase 3c) must:
//   1. Emit 'stop' exactly once.
//   2. Leave every pact topic before destroying the swarm, so no peer
//      reconnects mid-teardown.
//   3. Close each pact after the swarm so autobase sees "no peers"
//      before flushing.
//   4. Be idempotent — a second stop() on an already-stopped daemon
//      must not throw and must not emit 'stop' again.

test('Daemon.stop emits "stop" exactly once, even on double stop', async (t) => {
  const { daemon } = await tmpDaemon(t)
  let stops = 0
  daemon.on('stop', () => {
    stops++
  })
  await daemon.stop()
  await daemon.stop()
  t.is(stops, 1)
})

test('Daemon.stop leaves swarm topics before destroying the swarm', async (t) => {
  const { daemon } = await tmpDaemon(t)
  const order: string[] = []

  const swarmAny = (daemon as unknown as { _swarm: unknown })._swarm as {
    leave?: (key: unknown) => Promise<void>
    destroy?: () => Promise<void>
  }
  const origLeave = swarmAny.leave!.bind(swarmAny as object) as (key: unknown) => Promise<void>
  const origDestroy = swarmAny.destroy!.bind(swarmAny as object) as () => Promise<void>
  ;(swarmAny as { leave: unknown }).leave = async (k: unknown) => {
    order.push('leave')
    return origLeave(k)
  }
  ;(swarmAny as { destroy: unknown }).destroy = async () => {
    order.push('destroy')
    return origDestroy()
  }

  await daemon.stop()
  t.ok(order.includes('leave'), 'leave() was called at least once')
  t.is(order[order.indexOf('leave')], 'leave')
  t.ok(order.indexOf('leave') < order.indexOf('destroy'), 'leave() happens before destroy()')
})

test('Daemon.stop is safe to call when never started', async (t) => {
  const { daemon } = await tmpDaemon(t, { start: false })
  let stops = 0
  daemon.on('stop', () => {
    stops++
  })
  // No start() call — stop() still closes the pact on disk cleanly.
  await daemon.stop()
  t.is(stops, 1)
})
