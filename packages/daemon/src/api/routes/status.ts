import type { FastifyInstance } from 'fastify'
import type { Daemon } from '../../daemon'

export default async function statusRoute(
  app: FastifyInstance,
  { daemon }: { daemon: Daemon },
): Promise<void> {
  app.get('/v1/status', async () => ({
    pact_id: daemon.pactKey,
    pact_name: daemon.pactName,
    pact_purpose: daemon.pactPurpose,
    peer_handle: daemon.peerHandle,
    display_name: daemon.displayName,
    role: daemon.role,
    public_key: daemon.publicKey,
    peers: daemon.connections,
    entries: daemon.viewVersion,
    is_writer: daemon.isWriter,
    is_indexer: daemon.isIndexer,
    synced: daemon.viewVersion > 0,
  }))
}
