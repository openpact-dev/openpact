import type { FastifyInstance, FastifyReply } from 'fastify'
import type { Daemon } from '../../daemon'

const KEEPALIVE_MS = 25_000
const RETRY_MS = 1_000

interface SseFrame {
  event: string
  data: unknown
}

function writeFrame(reply: FastifyReply, frame: SseFrame): void {
  reply.raw.write(`event: ${frame.event}\n`)
  reply.raw.write(`data: ${JSON.stringify(frame.data)}\n\n`)
}

export default async function eventsRoute(
  app: FastifyInstance,
  { daemon }: { daemon: Daemon },
): Promise<void> {
  app.get('/v1/events', (req, reply) => {
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    })
    // Reconnect cadence for the browser's EventSource. Without this,
    // browsers default to ~3s; we want snappy reconnect after a daemon
    // restart.
    reply.raw.write(`retry: ${RETRY_MS}\n\n`)

    // Subscribe to daemon events. Each handler writes one SSE frame.
    // The daemon's `entry-applied` and `invalid-entry` payloads carry
    // an autobase `node` reference which contains circular RocksDB
    // internals — slim to the wire-shaped fields the dashboard needs
    // before serialising.
    const onEntryApplied = (info: { kind: string; entry: unknown; key?: string }) =>
      writeFrame(reply, {
        event: 'entry-applied',
        data: { kind: info.kind, entry: info.entry, key: info.key },
      })
    const onInvalidEntry = (info: { reason: string; entry?: unknown }) =>
      writeFrame(reply, {
        event: 'invalid-entry',
        data: { reason: info.reason, entry: info.entry },
      })
    const onPeerAdd = (info: unknown) => writeFrame(reply, { event: 'peer-add', data: info })
    const onPeerRemove = (info: unknown) => writeFrame(reply, { event: 'peer-remove', data: info })
    const onUpdate = () => writeFrame(reply, { event: 'update', data: {} })

    daemon.on('entry-applied', onEntryApplied)
    daemon.on('invalid-entry', onInvalidEntry)
    daemon.on('peer-add', onPeerAdd)
    daemon.on('peer-remove', onPeerRemove)
    daemon.on('update', onUpdate)

    // Keepalive comment lines so intermediate proxies don't half-close
    // the stream. SSE comments start with `:` and are ignored by the
    // browser.
    const keepalive = setInterval(() => {
      reply.raw.write(`: keepalive ${Date.now()}\n\n`)
    }, KEEPALIVE_MS)
    // Don't keep the Node event loop alive on this timer.
    keepalive.unref?.()

    const cleanup = () => {
      clearInterval(keepalive)
      daemon.off('entry-applied', onEntryApplied)
      daemon.off('invalid-entry', onInvalidEntry)
      daemon.off('peer-add', onPeerAdd)
      daemon.off('peer-remove', onPeerRemove)
      daemon.off('update', onUpdate)
    }

    req.raw.on('close', cleanup)
    req.raw.on('error', cleanup)
  })
}
