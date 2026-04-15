import type { FastifyInstance } from 'fastify'
import b4a from 'b4a'
import type { Daemon } from '../../daemon'
import { derive } from '../../peer-handle'
import { resolvePact } from '../pact-resolver'

void resolvePact

interface PeerInfo {
  id: string
  remote_key: string
  online: boolean
}

export default async function peersRoute(
  app: FastifyInstance,
  { daemon }: { daemon: Daemon },
): Promise<void> {
  // Connections are host-scoped (one Hyperswarm, many pact topics).
  // The dashboard's Network page asks per-pact, but the underlying
  // connection set is the same — we return every connection, since
  // a peer may be active on multiple pacts simultaneously and the
  // dashboard filters client-side.
  app.get<{ Params: { pactId: string } }>('/v1/pacts/:pactId/peers', async (req) => {
    // Resolve the pact just to validate it exists; peer list itself
    // is host-level.
    await resolvePact(daemon, req)
    const peers: PeerInfo[] = []
    const swarm = (daemon as any)._swarm
    if (swarm && swarm.connections) {
      for (const conn of swarm.connections) {
        const remoteKey = b4a.toString(conn.remotePublicKey, 'hex')
        peers.push({
          id: derive(conn.remotePublicKey),
          remote_key: remoteKey,
          online: true,
        })
      }
    }
    return peers
  })
}
