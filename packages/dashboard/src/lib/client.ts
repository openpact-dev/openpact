import { OpenPact } from '@openpact/sdk'

/**
 * Singleton SDK client. The dashboard talks to the daemon through the
 * Fastify proxy at `/api/*` (same origin), so we don't pass a port —
 * the SDK uses the page origin via the relative `baseUrl`.
 *
 * Browsers have native fetch; the SDK uses globalThis.fetch by default,
 * so we don't pass a custom fetch impl either.
 */
export const pact = new OpenPact({ baseUrl: '/api' })
