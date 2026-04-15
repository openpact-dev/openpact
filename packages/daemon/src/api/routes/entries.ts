import type { FastifyInstance } from 'fastify'
import type { Daemon } from '../../daemon'
import { findReferencedBy, getEntryById } from '../views'
import { HttpError } from '../errors'

interface IdParams {
  id: string
}

export default async function entriesRoute(
  app: FastifyInstance,
  { daemon }: { daemon: Daemon },
): Promise<void> {
  app.get<{ Params: IdParams }>('/v1/entries/:id', async (req) => {
    const entry = await getEntryById(daemon.view, req.params.id)
    if (!entry) {
      throw new HttpError(404, 'NOT_FOUND', `entry ${req.params.id} not found`)
    }
    return entry
  })

  app.get<{ Params: IdParams }>('/v1/entries/:id/referenced-by', async (req) => {
    return findReferencedBy(daemon.view, req.params.id)
  })
}
