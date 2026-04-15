import { OpenPact } from '@openpact/sdk'

/**
 * SDK clients, memoised by pactId so we don't re-bind fetch on every
 * render. The dashboard talks to the daemon through the Fastify proxy
 * at `/api/*` (same origin), so no port — the SDK uses the page
 * origin via the relative `baseUrl`.
 *
 * Use `hostClient` for top-level / pact-list calls; use `clientForPact`
 * inside any per-pact context.
 */
const cache = new Map<string, OpenPact>()

/** Host-only client — `/v1/ping`, `/v1/status`, `/v1/pacts/*`. */
export const hostClient = new OpenPact({ baseUrl: '/api' })

export function clientForPact(pactId: string): OpenPact {
  let c = cache.get(pactId)
  if (!c) {
    c = new OpenPact({ baseUrl: '/api', pactId })
    cache.set(pactId, c)
  }
  return c
}
