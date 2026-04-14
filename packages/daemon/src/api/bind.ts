import type { FastifyInstance } from 'fastify'

const ALLOWED_HOSTS = new Set(['127.0.0.1', '::1', 'localhost'])

export const DEFAULT_PORT = 7331

export interface BindOpts {
  port?: number
  host?: string
}

/**
 * Bind a Fastify app to a localhost-only address. Refuses any other host —
 * the OpenPact REST API is a local-only integration point per the
 * architectural invariants in CLAUDE.md.
 */
export async function bind(
  app: FastifyInstance,
  { port = DEFAULT_PORT, host = '127.0.0.1' }: BindOpts = {},
): Promise<string> {
  if (!ALLOWED_HOSTS.has(host)) {
    throw new Error(
      `OpenPact REST API must bind to localhost only — refused: ${host}. ` +
        `Allowed: ${[...ALLOWED_HOSTS].join(', ')}`,
    )
  }
  return app.listen({ port, host })
}
