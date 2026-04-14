import type { FastifyInstance } from 'fastify'
import type { Daemon } from '../../daemon'

export default async function pingRoute(
  app: FastifyInstance,
  _opts: { daemon: Daemon },
): Promise<void> {
  app.get('/v1/ping', async () => ({ ok: true }))
}
