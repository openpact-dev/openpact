import b4a from 'b4a'
import { validate, type ValidationResult } from './schemas'
import * as entryId from './entry-id'

export const INDEXER_PREFIX = '_indexers/'
// '/' is 0x2F, '0' is 0x30, so '_indexers0' bounds the prefix range exactly.
const INDEXER_RANGE_END = '_indexers0'

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

export interface InvalidInfo {
  reason: InvalidReason
  node: ApplyNode
  entry?: unknown
  errors?: ValidationResult extends { errors?: infer E } ? E : never
}

export interface AppliedInfo {
  kind: 'entry' | 'admin'
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
        if (!isIndexer) {
          onInvalid({ reason: 'admin-from-non-indexer', node, entry })
          continue
        }
        await applyAdmin(typedEntry, view, host)
        onApplied({ kind: 'admin', entry, node })
        continue
      }

      const id = entryId.encode({ writerKey, seq: node.length ?? 0 })
      const key = `${typedEntry.type}/${typedEntry.timestamp}/${id}`
      const stored = { ...typedEntry, id }
      await view.put(key, stored)
      onApplied({ kind: 'entry', entry: stored, node, key })
    }
  }
}

async function isIndexerKey(view: ApplyView, writerKeyHex: string): Promise<boolean> {
  const got = await view.get(`${INDEXER_PREFIX}${writerKeyHex}`)
  return got != null
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
    if (indexer) {
      await view.put(`${INDEXER_PREFIX}${keyHex}`, true)
    }
  } else if (entry.payload.action === 'removeWriter') {
    await host.removeWriter(keyBuf)
    await view.del(`${INDEXER_PREFIX}${keyHex}`)
  }
}

function noop(): void {}
