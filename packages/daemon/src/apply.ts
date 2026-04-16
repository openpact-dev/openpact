import b4a from 'b4a'
import { validate, type ValidationResult } from './schemas'
import * as entryId from './entry-id'

export const INDEXER_PREFIX = '_indexers/'
// '/' is 0x2F, '0' is 0x30, so '_indexers0' bounds the prefix range exactly.
const INDEXER_RANGE_END = '_indexers0'
export const MEMBER_PREFIX = '_members/'
export const MEMBER_RANGE_END = '_members0'

export const INVITE_PREFIX = '_invites/'

// Advisory display_name index: `_agents/<agent_id> = { name, ts }`.
// Populated from every valid entry that carries a non-empty display_name
// (including admin + invite-redeemed, which aren't stored as browsable
// `<type>/...` keys). Lets the peers endpoint resolve names even when a
// peer has yet to post a user-facing entry.
export const AGENT_NAME_PREFIX = '_agents/'
export const AGENT_NAME_RANGE_END = '_agents0'

export interface ApplyNode {
  value: unknown
  from?: { key?: Buffer | null } | null
  length?: number
}

export interface ApplyView {
  get(key: string): Promise<{ key: string; value: unknown } | null>
  put(key: string, value: unknown): Promise<void>
  del(key: string): Promise<void>
  peek(range: { gte: string; lt: string }): Promise<{ key: string; value: unknown } | null>
}

export interface ApplyHost {
  addWriter(key: Buffer, opts: { indexer: boolean }): Promise<void>
  removeWriter(key: Buffer): Promise<void>
}

export type InvalidReason =
  | 'not-an-object'
  | 'unknown-type'
  | 'schema'
  | 'payload-too-large'
  | 'no-writer-key'
  | 'admin-from-non-indexer'
  | 'invite-from-non-indexer'
  | 'invite-already-spent'

export interface InvalidInfo {
  reason: InvalidReason
  node: ApplyNode
  entry?: unknown
  errors?: ValidationResult extends { errors?: infer E } ? E : never
}

export interface AppliedInfo {
  kind: 'entry' | 'admin' | 'invite-redeemed'
  entry: unknown
  node: ApplyNode
  key?: string
}

export interface ApplyOpts {
  onInvalid?: (info: InvalidInfo) => void
  onApplied?: (info: AppliedInfo) => void
}

export type ApplyFn = (nodes: ApplyNode[], view: ApplyView, host: ApplyHost) => Promise<void>

export function makeApply(opts: ApplyOpts = {}): ApplyFn {
  const onInvalid = opts.onInvalid || noop
  const onApplied = opts.onApplied || noop

  return async function apply(nodes, view, host) {
    for (const node of nodes) {
      const entry = node.value

      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
        onInvalid({ reason: 'not-an-object', node })
        continue
      }

      const result = validate(entry)
      if (!result.valid) {
        onInvalid({
          reason: result.reason,
          errors: result.errors as InvalidInfo['errors'],
          node,
          entry,
        })
        continue
      }

      const writerKey = node.from && node.from.key
      if (!writerKey) {
        onInvalid({ reason: 'no-writer-key', node, entry })
        continue
      }
      const writerKeyHex = b4a.toString(writerKey, 'hex') as string

      await upsertAgentName(entry, view)

      // First writer implicitly becomes the first member.
      let isMember = await isMemberKey(view, writerKeyHex)
      if (!isMember) {
        const anyMember = await view.peek({ gte: MEMBER_PREFIX, lt: MEMBER_RANGE_END })
        if (!anyMember) {
          await view.put(`${MEMBER_PREFIX}${writerKeyHex}`, true)
          isMember = true
        }
      }

      // Indexer check with implicit-creator bootstrap.
      let isIndexer = await isIndexerKey(view, writerKeyHex)
      if (!isIndexer) {
        const anyIndexer = await view.peek({ gte: INDEXER_PREFIX, lt: INDEXER_RANGE_END })
        if (!anyIndexer) {
          await view.put(`${INDEXER_PREFIX}${writerKeyHex}`, true)
          isIndexer = true
        }
      }

      const typedEntry = entry as {
        type: string
        timestamp: string
        agent_id: string
        payload: { action?: string; key?: string; indexer?: boolean }
      }

      if (typedEntry.type === 'admin') {
        // Self-removal is the one admin action a non-indexer writer may
        // issue — used by `openpact remove` / the dashboard's Leave flow
        // so a peer can revoke their own writer rights when walking away
        // from a pact. Any other admin action still requires indexer
        // authority.
        const selfRevoke =
          typedEntry.payload.action === 'removeWriter' &&
          typeof typedEntry.payload.key === 'string' &&
          typedEntry.payload.key.toLowerCase() === writerKeyHex.toLowerCase()
        if (!isIndexer && !selfRevoke) {
          onInvalid({ reason: 'admin-from-non-indexer', node, entry })
          continue
        }
        await applyAdmin(typedEntry, view, host)
        onApplied({ kind: 'admin', entry, node })
        continue
      }

      if (typedEntry.type === 'invite-redeemed') {
        if (!isIndexer) {
          onInvalid({ reason: 'invite-from-non-indexer', node, entry })
          continue
        }
        const redeemPayload = typedEntry.payload as { nonce?: string; redeemed_by?: string }
        const nonce = redeemPayload.nonce
        const existing = nonce ? await view.get(`${INVITE_PREFIX}${nonce}`) : null
        if (existing) {
          // First redeem wins, even when two indexers race the same nonce.
          onInvalid({ reason: 'invite-already-spent', node, entry })
          continue
        }
        if (nonce) {
          await view.put(`${INVITE_PREFIX}${nonce}`, {
            redeemed_by: redeemPayload.redeemed_by,
            redeemed_at: typedEntry.timestamp,
            redeemer: typedEntry.agent_id,
          })
        }
        onApplied({ kind: 'invite-redeemed', entry, node })
        continue
      }

      const id = entryId.encode({ writerKey, seq: node.length ?? 0 })
      const key = `${typedEntry.type}/${typedEntry.timestamp}/${id}`
      const stored = { ...typedEntry, id }
      await view.put(key, stored)

      // Reverse-ref index. For every target referenced by this entry,
      // write a `ref/<target>/<source>` key carrying the source entry
      // value. The Trace screen's "referenced by" lookup walks this
      // prefix. Idempotent: re-applying the same entry overwrites with
      // the same value.
      const refs = (typedEntry as { refs?: unknown }).refs
      if (Array.isArray(refs)) {
        for (const target of refs) {
          if (typeof target !== 'string' || !target) continue
          await view.put(`ref/${target}/${id}`, stored)
        }
      }

      onApplied({ kind: 'entry', entry: stored, node, key })
    }
  }
}

async function isIndexerKey(view: ApplyView, writerKeyHex: string): Promise<boolean> {
  const got = await view.get(`${INDEXER_PREFIX}${writerKeyHex}`)
  return got != null
}

async function isMemberKey(view: ApplyView, writerKeyHex: string): Promise<boolean> {
  const got = await view.get(`${MEMBER_PREFIX}${writerKeyHex}`)
  return got != null
}

/**
 * Upsert `_agents/<agent_id>` with the entry's display_name if present and
 * newer than any existing record. Keeps the index authoritative across
 * every entry type without forcing admin/invite-redeemed into the
 * browsable `<type>/<ts>/<id>` space.
 */
async function upsertAgentName(entry: unknown, view: ApplyView): Promise<void> {
  if (!entry || typeof entry !== 'object') return
  const e = entry as { agent_id?: unknown; display_name?: unknown; timestamp?: unknown }
  if (typeof e.agent_id !== 'string' || !e.agent_id) return
  if (typeof e.display_name !== 'string') return
  const name = e.display_name.trim()
  if (!name) return
  const ts = typeof e.timestamp === 'string' ? e.timestamp : ''
  const key = `${AGENT_NAME_PREFIX}${e.agent_id}`
  const existing = await view.get(key)
  const existingTs =
    existing && typeof existing.value === 'object' && existing.value
      ? ((existing.value as { ts?: unknown }).ts as string | undefined) || ''
      : ''
  if (ts && existingTs && ts <= existingTs) return
  await view.put(key, { name, ts })
}

async function applyAdmin(
  entry: { payload: { action?: string; key?: string; indexer?: boolean } },
  view: ApplyView,
  host: ApplyHost,
): Promise<void> {
  const keyHex = entry.payload.key as string
  const keyBuf = b4a.from(keyHex, 'hex') as Buffer
  if (entry.payload.action === 'addWriter') {
    const indexer = !!entry.payload.indexer
    await host.addWriter(keyBuf, { indexer })
    await view.put(`${MEMBER_PREFIX}${keyHex}`, true)
    if (indexer) {
      await view.put(`${INDEXER_PREFIX}${keyHex}`, true)
    }
  } else if (entry.payload.action === 'removeWriter') {
    await host.removeWriter(keyBuf)
    await view.del(`${MEMBER_PREFIX}${keyHex}`)
    await view.del(`${INDEXER_PREFIX}${keyHex}`)
  }
}

function noop(): void {}
