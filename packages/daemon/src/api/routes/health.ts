import type { FastifyInstance } from 'fastify'
import type { Daemon } from '../../daemon'

/**
 * Liveness, readiness, and Prometheus-scrape endpoints.
 *
 *   GET /v1/healthz  — 200 iff the HTTP server is responding. Never
 *                      reaches into daemon internals; a "healthy"
 *                      response means the process hasn't crashed.
 *   GET /v1/readyz   — 200 iff the daemon has at least one pact
 *                      loaded and the swarm has been started; else
 *                      503 so supervisors/load balancers know not to
 *                      route work here yet.
 *   GET /v1/metrics  — text/plain Prometheus exposition of the
 *                      handful of signals a supervisor cares about:
 *                      pact count, peer count, per-pact view height.
 *
 * `/v1/healthz` and `/v1/readyz` are exempt from auth (see
 * `api/auth.ts#PUBLIC_PATHS`) so orchestrators (systemd unit
 * `ExecStartPost`, k8s probes, etc.) don't need the bearer token.
 * `/v1/metrics` stays auth-gated — the daemon binds loopback-only
 * and a local Prometheus scraper can read the token straight out of
 * `~/.openpact/daemon.json`.
 */
export default async function healthRoute(
  app: FastifyInstance,
  { daemon, startedAt }: { daemon: Daemon; startedAt: number },
): Promise<void> {
  // Rate-limit liveness + readiness probes separately: they may be
  // hammered every second by a supervisor and should not eat into the
  // caller-facing budget.
  app.get(
    '/v1/healthz',
    // `rateLimit: false` opts the route out of the global limiter.
    // Liveness is polled aggressively by supervisors (every 1s is
    // common) and must not share budget with caller-facing traffic.
    { config: { rateLimit: false } },
    async () => ({ ok: true, status: 'alive' }),
  )

  app.get('/v1/readyz', { config: { rateLimit: false } }, async (_req, reply) => {
    const pacts = await daemon.listPacts()
    const ready = pacts.length > 0
    reply.code(ready ? 200 : 503)
    return {
      ok: ready,
      status: ready ? 'ready' : 'not-ready',
      pact_count: pacts.length,
      agents: daemon.connections,
    }
  })

  app.get('/v1/metrics', async (_req, reply) => {
    const registryPacts = await daemon.listPacts()
    const openPacts = daemon.openPacts
    const sseStats = __sseCounters()
    const mem = process.memoryUsage()
    const uptimeSeconds = Math.max(0, (Date.now() - startedAt) / 1000)

    const lines: string[] = []
    const helpType = (name: string, help: string, type: string) => {
      lines.push(`# HELP ${name} ${help}`)
      lines.push(`# TYPE ${name} ${type}`)
    }

    helpType('openpact_process_uptime_seconds', 'Seconds since daemon start.', 'gauge')
    lines.push(`openpact_process_uptime_seconds ${uptimeSeconds.toFixed(3)}`)

    helpType(
      'openpact_process_resident_memory_bytes',
      'RSS of the daemon process in bytes.',
      'gauge',
    )
    lines.push(`openpact_process_resident_memory_bytes ${mem.rss}`)

    helpType('openpact_process_heap_used_bytes', 'V8 heap bytes currently in use.', 'gauge')
    lines.push(`openpact_process_heap_used_bytes ${mem.heapUsed}`)

    helpType('openpact_pacts_total', 'Number of pacts registered on this host.', 'gauge')
    lines.push(`openpact_pacts_total ${registryPacts.length}`)

    helpType(
      'openpact_pacts_open',
      'Number of pacts currently loaded into memory on this host.',
      'gauge',
    )
    lines.push(`openpact_pacts_open ${openPacts.length}`)

    helpType('openpact_agents_connected', 'Currently connected Hyperswarm agents.', 'gauge')
    lines.push(`openpact_agents_connected ${daemon.connections}`)

    helpType(
      'openpact_sse_backpressure_closes_total',
      'Count of SSE clients dropped for exceeding the outbound buffer cap.',
      'counter',
    )
    lines.push(`openpact_sse_backpressure_closes_total ${sseStats.backpressureCloses}`)

    // Open-pact gauges carry a `pact_id` label so Prometheus can
    // distinguish per-pact series. The alias isn't accessible from
    // the Pact instance itself; operators correlate pact_id → alias
    // via `GET /v1/status`.
    helpType(
      'openpact_pact_view_version',
      'Current view (Hyperbee) height for each open pact.',
      'gauge',
    )
    for (const pact of openPacts) {
      const label = prometheusLabels({ pact_id: pact.pactKey ?? '' })
      lines.push(`openpact_pact_view_version${label} ${pact.viewVersion ?? 0}`)
    }

    helpType(
      'openpact_pact_is_indexer',
      '1 if the local peer is an indexer (or creator) for this pact, else 0.',
      'gauge',
    )
    for (const pact of openPacts) {
      const label = prometheusLabels({ pact_id: pact.pactKey ?? '' })
      const v = pact.role === 'indexer' || pact.role === 'creator' ? 1 : 0
      lines.push(`openpact_pact_is_indexer${label} ${v}`)
    }

    helpType(
      'openpact_pact_members_online',
      'Authenticated live members for each open pact.',
      'gauge',
    )
    for (const pact of openPacts) {
      const label = prometheusLabels({ pact_id: pact.pactKey ?? '' })
      const online = pact.pactKey ? daemon.onlineMembers(pact.pactKey).size : 0
      lines.push(`openpact_pact_members_online${label} ${online}`)
    }

    reply.header('content-type', 'text/plain; version=0.0.4')
    return lines.join('\n') + '\n'
  })
}

// ----- SSE counter wiring ----------------------------------------------------
//
// Shared, module-scoped counter. The events route emits
// `sse-backpressure-close` on the daemon whenever it tears down a slow
// consumer; we listen here so /v1/metrics can expose the count without
// forcing the daemon class itself to carry metrics plumbing.
//
// `installSseMetrics(daemon)` is idempotent — calling it twice on the
// same daemon instance is a no-op. Wiring lives in createApi where the
// daemon is in scope.

const sseCounters = { backpressureCloses: 0 }
const wiredDaemons = new WeakSet<Daemon>()

export function installSseMetrics(daemon: Daemon): void {
  if (wiredDaemons.has(daemon)) return
  wiredDaemons.add(daemon)
  daemon.on('sse-backpressure-close', () => {
    sseCounters.backpressureCloses++
  })
}

function __sseCounters(): { backpressureCloses: number } {
  return sseCounters
}

function prometheusLabels(kv: Record<string, string>): string {
  const parts = Object.entries(kv).map(([k, v]) => `${k}="${escapeLabelValue(v)}"`)
  return parts.length ? `{${parts.join(',')}}` : ''
}

function escapeLabelValue(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
}
