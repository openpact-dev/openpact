import type { FastifyInstance } from 'fastify'
import b4a from 'b4a'
import type { Daemon } from '../../daemon'
import { derive } from '../../peer-handle'

interface PeerInfo {
  id: string
  remote_key: string
  online: boolean
}

export default async function peersRoute(
  app: FastifyInstance,
  { daemon }: { daemon: Daemon },
): Promise<void> {
  app.get('/v1/peers', async () => {
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
