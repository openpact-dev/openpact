import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Daemon } from '../../daemon'

const KEEPALIVE_MS = 25_000
const RETRY_MS = 1_000

/**
 * Maximum number of bytes we tolerate sitting in the outbound TCP
 * buffer before declaring the client a slow consumer and closing the
 * stream. EventSource auto-reconnects after `retry: ${RETRY_MS}`, so a
 * brief hiccup on the client side is recoverable. Without this cap, a
 * wedged consumer would let the buffer grow to OOM — one event-applied
 * frame per entry times a runaway writer is enough to matter.
 *
 * 1 MiB equals roughly 2k small entry-applied frames; any client that
 * can't flush that within the keep-alive window is effectively dead.
 *
 * Override for tests via the OPENPACT_SSE_BUFFER_BYTES env var —
 * production code paths use the default.
 */
const MAX_BUFFERED_BYTES_DEFAULT = 1 * 1024 * 1024
function maxBufferedBytes(): number {
  const raw = process.env.OPENPACT_SSE_BUFFER_BYTES
  if (!raw) return MAX_BUFFERED_BYTES_DEFAULT
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : MAX_BUFFERED_BYTES_DEFAULT
}

interface SseFrame {
  event: string
  data: unknown
}

/**
 * Host-level SSE stream — one endpoint demultiplexes events from every
 * pact on the host. Each frame's `data` includes `pactId` + `alias`
 * so the dashboard can filter by its currently-selected pact.
 *
 * URL stays at `/v1/events` (not under `/v1/pacts/:pactId/*`) because
 * one EventSource subscription is cheaper than one per pact, and
 * switching pacts in the dashboard shouldn't tear down the stream.
 *
 * Back-pressure:
 *   If a client stops reading, Node buffers writes in the socket's
 *   writable side. We check `reply.raw.writableLength` before every
 *   frame and tear the connection down once it crosses
 *   MAX_BUFFERED_BYTES. Dropping individual frames would give the
 *   client an inconsistent event log; closing is honest and the
 *   client reconnects via `retry:` — fresh state on reconnect is the
 *   caller's responsibility (see `/v1/pacts/:pactId/entries`).
 */
export default async function eventsRoute(
  app: FastifyInstance,
  { daemon }: { daemon: Daemon },
): Promise<void> {
  app.get(
    '/v1/events',
    {
      // SSE is long-lived; the rate-limit plugin counts it once at
      // open and then leaves the connection alone. Still, the client
      // may reconnect aggressively on transient errors, so opt out
      // entirely — auth already gates this route.
      config: { rateLimit: false },
    },
    (req: FastifyRequest, reply: FastifyReply) => {
      reply.raw.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      })
      reply.raw.write(`retry: ${RETRY_MS}\n\n`)

      const threshold = maxBufferedBytes()
      let closed = false

      const closeForBackpressure = (pendingBytes: number) => {
        if (closed) return
        closed = true
        req.log.warn(
          { pendingBytes, threshold },
          'SSE back-pressure threshold exceeded — closing slow consumer',
        )
        // Observability hook used by monitoring + tests. Emitted once
        // per disconnected client; callers can aggregate if they want
        // "how many slow consumers have I had" as a health signal.
        daemon.emit('sse-backpressure-close', { pendingBytes, threshold })
        cleanup()
        // Signal end-of-stream so EventSource reconnects cleanly
        // instead of surfacing a raw socket error.
        try {
          reply.raw.end()
        } catch {
          /* ignore — socket already torn down */
        }
      }

      function writeFrame(frame: SseFrame): void {
        if (closed || reply.raw.writableEnded || reply.raw.destroyed) return
        const pending = reply.raw.writableLength ?? 0
        if (pending > threshold) {
          closeForBackpressure(pending)
          return
        }
        reply.raw.write(`event: ${frame.event}\n`)
        reply.raw.write(`data: ${JSON.stringify(frame.data)}\n\n`)
      }

      // Pact-level events carry {pactId, alias, ...} envelopes from
      // the daemon. Peer-{add,remove} are host-level (no pact scope).
      const onEntryApplied = (info: {
        kind: string
        entry: unknown
        key?: string
        pactId?: string
        alias?: string
      }) =>
        writeFrame({
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
        writeFrame({
          event: 'invalid-entry',
          data: {
            reason: info.reason,
            entry: info.entry,
            pact_id: info.pactId,
            alias: info.alias,
          },
        })
      const onPeerAdd = (info: unknown) => writeFrame({ event: 'peer-add', data: info })
      const onPeerRemove = (info: unknown) => writeFrame({ event: 'peer-remove', data: info })
      const onUpdate = (info: { pactId?: string; alias?: string }) =>
        writeFrame({
          event: 'update',
          data: { pact_id: info?.pactId, alias: info?.alias },
        })
      const onMemberOnline = (info: { pactId?: string; alias?: string; member_key?: string }) =>
        writeFrame({
          event: 'member-online',
          data: { pact_id: info?.pactId, alias: info?.alias, member_key: info?.member_key },
        })
      const onMemberOffline = (info: { pactId?: string; alias?: string; member_key?: string }) =>
        writeFrame({
          event: 'member-offline',
          data: { pact_id: info?.pactId, alias: info?.alias, member_key: info?.member_key },
        })

      daemon.on('entry-applied', onEntryApplied)
      daemon.on('invalid-entry', onInvalidEntry)
      daemon.on('peer-add', onPeerAdd)
      daemon.on('peer-remove', onPeerRemove)
      daemon.on('update', onUpdate)
      daemon.on('member-online', onMemberOnline)
      daemon.on('member-offline', onMemberOffline)

      const keepalive = setInterval(() => {
        if (closed || reply.raw.writableEnded || reply.raw.destroyed) return
        const pending = reply.raw.writableLength ?? 0
        // Keepalives are the one comment-line write that we don't want
        // adding to back-pressure — if the socket is already choking on
        // real frames, tear down here too.
        if (pending > threshold) {
          closeForBackpressure(pending)
          return
        }
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
        daemon.off('member-online', onMemberOnline)
        daemon.off('member-offline', onMemberOffline)
      }

      req.raw.on('close', () => {
        closed = true
        cleanup()
      })
      req.raw.on('error', () => {
        closed = true
        cleanup()
      })
    },
  )
}
