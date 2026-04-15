import type { FastifyRequest } from 'fastify'
import type { Daemon } from '../daemon'
import type { Pact } from '../pact'
import { HttpError } from './errors'

/**
 * Resolve `:pactId` from a request's params to an open Pact.
 * Accepts either a short alias or the canonical 64-hex pact key.
 *
 * Throws 404 UNKNOWN_PACT when the value doesn't match any registered
 * pact. Every route under `/v1/pacts/:pactId/*` uses this — pulling
 * it into one place keeps the error envelope and the lookup logic
 * consistent.
 */
export async function resolvePact(
  daemon: Daemon,
  req: FastifyRequest<{ Params: { pactId: string } }>,
): Promise<Pact> {
  const value = req.params.pactId
  if (!value) {
    throw new HttpError(400, 'BAD_REQUEST', 'missing :pactId in URL')
  }
  // Try alias first, then fall back to matching the 64-hex key.
  const pacts = await daemon.listPacts()
  const byAlias = pacts.find((p) => p.alias === value)
  const byId = byAlias ?? pacts.find((p) => p.pactId === value)
  if (!byId) {
    throw new HttpError(404, 'UNKNOWN_PACT', `no pact with alias or pact_id ${value} on this host`)
  }
  return daemon.openPact(byId.alias)
}
