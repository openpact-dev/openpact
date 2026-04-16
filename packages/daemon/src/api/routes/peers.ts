import type { FastifyInstance } from 'fastify'
import b4a from 'b4a'
import type { Daemon } from '../../daemon'
import { derive } from '../../peer-handle'
import { INDEXER_PREFIX } from '../../apply'
import { resolvePact } from '../pact-resolver'

interface PeerInfo {
  id: string
  remote_key: string
  role: 'indexer' | 'member'
  display_name: string | null
  online: boolean
}

const ENTRY_TYPES = ['knowledge', 'task', 'skill', 'message', 'invite-redeemed', 'admin'] as const

async function buildDisplayNameIndex(view: any): Promise<Map<string, string>> {
  const latest = new Map<string, { ts: string; name: string }>()
  for (const type of ENTRY_TYPES) {
    const range = { gte: `${type}/`, lt: `${type}0` }
    for await (const row of view.createReadStream(range)) {
      const v = row && row.value
      if (!v || typeof v !== 'object') continue
      const agentId = (v as { agent_id?: unknown }).agent_id
      const name = (v as { display_name?: unknown }).display_name
      if (typeof agentId !== 'string' || typeof name !== 'string' || !name) continue
      const ts =
        typeof (v as { timestamp?: unknown }).timestamp === 'string'
          ? (v as { timestamp: string }).timestamp
          : ''
      const existing = latest.get(agentId)
      if (!existing || ts > existing.ts) latest.set(agentId, { ts, name })
    }
  }
  const out = new Map<string, string>()
  for (const [k, v] of latest) out.set(k, v.name)
  return out
}

async function isIndexer(view: any, keyHex: string): Promise<boolean> {
  const got = await view.get(`${INDEXER_PREFIX}${keyHex}`)
  return got != null
}

export default async function peersRoute(
  app: FastifyInstance,
  { daemon }: { daemon: Daemon },
): Promise<void> {
  // Peers scoped to one pact. We walk the pact's autobase active-writer
  // set rather than every Hyperswarm connection, so switching pacts on
  // the dashboard shows the right peer list even when a single daemon
  // holds several pacts over one shared swarm.
  //
  // The writer key (writer.core.key) is the canonical identity on the
  // ledger — admin.addWriter entries reference it, and agent_id is
  // derived from it. Online status reads the active replication peer
  // count on the hypercore backing each writer.
  app.get<{ Params: { pactId: string } }>('/v1/pacts/:pactId/peers', async (req) => {
    const pact = await resolvePact(daemon, req)
    const view = pact.view
    const autobase = pact.autobase
    if (!autobase || !view) return []

    const selfKeyHex = pact.publicKey ?? ''
    const nameByAgent = await buildDisplayNameIndex(view)

    const peers: PeerInfo[] = []
    for (const writer of autobase.activeWriters) {
      // Writers self-revoked (via admin.removeWriter targeting themselves
      // when they leave) or removed by an indexer linger in activeWriters
      // with isRemoved=true; skip them so they disappear from the list.
      if (writer?.isRemoved) continue
      const core = writer?.core
      if (!core || !core.key) continue
      const keyBuf: Buffer = core.key
      const keyHex = b4a.toString(keyBuf, 'hex') as string
      if (keyHex === selfKeyHex) continue
      const agentId = derive(keyBuf)
      const role: 'indexer' | 'member' = (await isIndexer(view, keyHex)) ? 'indexer' : 'member'
      const online = Array.isArray(core.peers) ? core.peers.length > 0 : false
      peers.push({
        id: agentId,
        remote_key: keyHex,
        role,
        display_name: nameByAgent.get(agentId) ?? null,
        online,
      })
    }
    return peers
  })
}
