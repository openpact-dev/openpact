import type { FastifyInstance } from 'fastify'
import b4a from 'b4a'
import type { Daemon } from '../../daemon'
import { derive } from '../../peer-handle'
import {
  AGENT_NAME_PREFIX,
  AGENT_NAME_RANGE_END,
  INDEXER_PREFIX,
  MEMBER_PREFIX,
  MEMBER_RANGE_END,
} from '../../apply'
import { resolvePact } from '../pact-resolver'

interface PeerInfo {
  id: string
  remote_key: string
  role: 'indexer' | 'member'
  display_name: string | null
  online: boolean
}

/**
 * Read the `_agents/<agent_id>` index populated by apply.ts. Every
 * valid entry with a non-empty display_name — including admin and
 * invite-redeemed — updates this map, so peers show their name even
 * before posting user-facing content.
 */
async function buildDisplayNameIndex(view: any): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const range = { gte: AGENT_NAME_PREFIX, lt: AGENT_NAME_RANGE_END }
  for await (const row of view.createReadStream(range)) {
    const v = row && row.value
    if (!v || typeof v !== 'object') continue
    const name = (v as { name?: unknown }).name
    if (typeof name !== 'string' || !name) continue
    const agentId = typeof row.key === 'string' ? row.key.slice(AGENT_NAME_PREFIX.length) : ''
    if (!agentId) continue
    out.set(agentId, name)
  }
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
  // Peers scoped to one pact. We walk the ledger's `_members/` index so
  // peers stay on the list regardless of whether autobase is currently
  // tracking their writer core — autobase GCs inactive writers out of
  // `activeWriters` once they've flushed, but the member entry on the
  // ledger is authoritative until an explicit admin.removeWriter lands.
  //
  // For online status we cross-reference `autobase.activeWriters`: if a
  // writer is tracked and its hypercore has remote peers, we call that
  // online. A member who's been GC'd or has no peers on their core is
  // "offline" — but still present in the list.
  app.get<{ Params: { pactId: string } }>('/v1/pacts/:pactId/peers', async (req) => {
    const pact = await resolvePact(daemon, req)
    const view = pact.view
    const autobase = pact.autobase
    if (!autobase || !view) return []

    const selfKeyHex = pact.publicKey ?? ''
    const nameByAgent = await buildDisplayNameIndex(view)

    // Snapshot the currently-tracked writers so we can cross-reference
    // them by key. `activeWriters` is a live set; iterating it during
    // async work risks tearing, and we only need it for presence.
    const activeByKey = new Map<string, any>()
    for (const writer of autobase.activeWriters) {
      if (!writer || writer.isRemoved) continue
      const core = writer.core
      if (!core || !core.key) continue
      activeByKey.set(b4a.toString(core.key, 'hex') as string, writer)
    }

    const peers: PeerInfo[] = []
    const range = { gte: MEMBER_PREFIX, lt: MEMBER_RANGE_END }
    for await (const row of view.createReadStream(range)) {
      const keyHex = typeof row?.key === 'string' ? row.key.slice(MEMBER_PREFIX.length) : ''
      if (!keyHex || keyHex === selfKeyHex) continue
      const keyBuf = b4a.from(keyHex, 'hex') as Buffer
      const agentId = derive(keyBuf)
      const role: 'indexer' | 'member' = (await isIndexer(view, keyHex)) ? 'indexer' : 'member'
      const writer = activeByKey.get(keyHex)
      const core = writer?.core
      const online = core && Array.isArray(core.peers) ? core.peers.length > 0 : false
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
