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

/**
 * Host-level SSE stream — one endpoint demultiplexes events from every
 * pact on the host. Each frame's `data` includes `pactId` + `alias`
 * so the dashboard can filter by its currently-selected pact.
 *
 * URL stays at `/v1/events` (not under `/v1/pacts/:pactId/*`) because
 * one EventSource subscription is cheaper than one per pact, and
 * switching pacts in the dashboard shouldn't tear down the stream.
 */
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
    reply.raw.write(`retry: ${RETRY_MS}\n\n`)

    // Pact-level events carry {pactId, alias, ...} envelopes from
    // the daemon. Peer-{add,remove} are host-level (no pact scope).
    const onEntryApplied = (info: {
      kind: string
      entry: unknown
      key?: string
      pactId?: string
      alias?: string
    }) =>
      writeFrame(reply, {
        event: 'entry-applied',
        data: {
          kind: info.kind,
          entry: info.entry,
          key: info.key,
          pact_id: info.pactId,
          alias: info.alias,
        },
      })
    const onInvalidEntry = (info: {
      reason: string
      entry?: unknown
      pactId?: string
      alias?: string
    }) =>
      writeFrame(reply, {
        event: 'invalid-entry',
        data: {
          reason: info.reason,
          entry: info.entry,
          pact_id: info.pactId,
          alias: info.alias,
        },
      })
    const onPeerAdd = (info: unknown) => writeFrame(reply, { event: 'peer-add', data: info })
    const onPeerRemove = (info: unknown) => writeFrame(reply, { event: 'peer-remove', data: info })
    const onUpdate = (info: { pactId?: string; alias?: string }) =>
      writeFrame(reply, {
        event: 'update',
        data: { pact_id: info?.pactId, alias: info?.alias },
      })

    daemon.on('entry-applied', onEntryApplied)
    daemon.on('invalid-entry', onInvalidEntry)
    daemon.on('peer-add', onPeerAdd)
    daemon.on('peer-remove', onPeerRemove)
    daemon.on('update', onUpdate)

    const keepalive = setInterval(() => {
      reply.raw.write(`: keepalive ${Date.now()}\n\n`)
    }, KEEPALIVE_MS)
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
