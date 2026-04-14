import type { FastifyInstance } from 'fastify'
import type { Daemon } from '../../daemon'

export default async function statusRoute(
  app: FastifyInstance,
  { daemon }: { daemon: Daemon },
): Promise<void> {
  app.get('/v1/status', async () => ({
    pact_id: daemon.pactKey,
    peer_handle: daemon.peerHandle,
    role: daemon.role,
    public_key: daemon.publicKey,
    peers: daemon.connections,
    entries: daemon.viewVersion,
    is_writer: daemon.isWriter,
    is_indexer: daemon.isIndexer,
    synced: daemon.viewVersion > 0,
  }))
}
