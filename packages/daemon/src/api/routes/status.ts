import type { FastifyInstance } from 'fastify'
import type { Daemon } from '../../daemon'
import { resolvePact } from '../pact-resolver'

export default async function statusRoute(
  app: FastifyInstance,
  { daemon }: { daemon: Daemon },
): Promise<void> {
  // Host-level status: connection count, current pact, daemon metadata.
  app.get('/v1/status', async () => {
    const currentAlias = await daemon.currentAlias()
    const pacts = await daemon.listPacts()
    return {
      current: currentAlias,
      peers: daemon.connections,
      pact_count: pacts.length,
    }
  })

  // Per-pact status — the fat payload the dashboard / SDK rely on.
  app.get<{ Params: { pactId: string } }>('/v1/pacts/:pactId/status', async (req) => {
    const pact = await resolvePact(daemon, req)
    return {
      pact_id: pact.pactKey,
      pact_name: pact.pactName,
      pact_purpose: pact.pactPurpose,
      peer_handle: pact.peerHandle,
      display_name: pact.displayName,
      role: pact.role,
      public_key: pact.publicKey,
      peers: daemon.connections,
      entries: pact.viewVersion,
      is_member: pact.isMember,
      is_indexer: pact.isIndexer,
      synced: pact.viewVersion > 0,
    }
  })
}
