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

interface AgentInfo {
  id: string
  remote_key: string
  role: 'creator' | 'indexer' | 'member'
  display_name: string | null
  online: boolean
  is_self: boolean
}

/**
 * Read the `_agents/<agent_id>` index populated by apply.ts. Every
 * valid entry with a non-empty display_name (including admin and
 * invite-redeemed) updates this map, so agents show their name even
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

export default async function agentsRoute(
  app: FastifyInstance,
  { daemon }: { daemon: Daemon },
): Promise<void> {
  // Agents scoped to one pact. We walk the ledger's `_members/` index
  // so agents stay on the list regardless of whether autobase is
  // currently tracking their writer core. Autobase GCs inactive writers
  // out of `activeWriters` once they've flushed, but the member entry
  // on the ledger is authoritative until an explicit admin.removeWriter
  // lands.
  //
  // Online status comes from the daemon's authenticated member-auth
  // links, not autobase.activeWriters: autobase can GC a writer even
  // while we hold a live authenticated link to them, and a writer can
  // sit in activeWriters with an empty core.peers array right after
  // reconnect before hypercore finishes its handshake.
  app.get<{ Params: { pactId: string } }>('/v1/pacts/:pactId/agents', async (req) => {
    const pact = await resolvePact(daemon, req)
    const view = pact.view
    const autobase = pact.autobase
    const selfKeyHex = pact.publicKey ?? ''

    // Self is emitted first and does not depend on the view being up:
    // we know our own role/handle/display name from the pact instance.
    // Emitting it here means consumers see a stable "self row" from the
    // moment the pact is resolved, even before autobase/hypercore have
    // finished bootstrap.
    const agents: AgentInfo[] = []
    if (pact.isMember && selfKeyHex) {
      const selfRole: 'creator' | 'indexer' | 'member' =
        pact.role === 'creator' ? 'creator' : pact.isIndexer ? 'indexer' : 'member'
      agents.push({
        id: pact.peerHandle ?? derive(b4a.from(selfKeyHex, 'hex') as Buffer),
        remote_key: selfKeyHex,
        role: selfRole,
        display_name: pact.displayName ?? null,
        online: true,
        is_self: true,
      })
    }

    if (!autobase || !view) return agents

    const nameByAgent = await buildDisplayNameIndex(view)
    const onlineSet = pact.pactKey ? daemon.onlineMembers(pact.pactKey) : new Set<string>()

    const range = { gte: MEMBER_PREFIX, lt: MEMBER_RANGE_END }
    for await (const row of view.createReadStream(range)) {
      const keyHex = typeof row?.key === 'string' ? row.key.slice(MEMBER_PREFIX.length) : ''
      if (!keyHex || keyHex === selfKeyHex) continue
      const keyBuf = b4a.from(keyHex, 'hex') as Buffer
      const agentId = derive(keyBuf)
      const role: 'indexer' | 'member' = (await isIndexer(view, keyHex)) ? 'indexer' : 'member'
      const online = onlineSet.has(keyHex.toLowerCase())
      agents.push({
        id: agentId,
        remote_key: keyHex,
        role,
        display_name: nameByAgent.get(agentId) ?? null,
        online,
        is_self: false,
      })
    }
    return agents
  })
}
