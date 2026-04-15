import type { FastifyInstance } from 'fastify'
import type { Daemon } from '../../daemon'
import { findReferencedBy, getEntryById } from '../views'
import { HttpError } from '../errors'
import { resolvePact } from '../pact-resolver'

interface IdParams {
  pactId: string
  id: string
}

export default async function entriesRoute(
  app: FastifyInstance,
  { daemon }: { daemon: Daemon },
): Promise<void> {
  app.get<{ Params: IdParams }>('/v1/pacts/:pactId/entries/:id', async (req) => {
    const pact = await resolvePact(daemon, req)
    const entry = await getEntryById(pact.view, req.params.id)
    if (!entry) {
      throw new HttpError(404, 'NOT_FOUND', `entry ${req.params.id} not found`)
    }
    return entry
  })

  app.get<{ Params: IdParams }>('/v1/pacts/:pactId/entries/:id/referenced-by', async (req) => {
    const pact = await resolvePact(daemon, req)
    return findReferencedBy(pact.view, req.params.id)
  })
}
