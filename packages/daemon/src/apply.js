const b4a = require('b4a')
const { validate } = require('./schemas')
const entryId = require('./entry-id')

const INDEXER_PREFIX = '_indexers/'
// '/' is 0x2F, '0' is 0x30, so '_indexers0' bounds the prefix range exactly.
const INDEXER_RANGE_END = '_indexers0'

function makeApply(opts = {}) {
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
        onInvalid({ reason: result.reason, errors: result.errors, node, entry })
        continue
      }

      const writerKey = node.from && node.from.key
      if (!writerKey) {
        onInvalid({ reason: 'no-writer-key', node, entry })
        continue
      }
      const writerKeyHex = b4a.toString(writerKey, 'hex')

      // Indexer check with implicit-creator bootstrap.
      let isIndexer = await isIndexerKey(view, writerKeyHex)
      if (!isIndexer) {
        const anyIndexer = await view.peek({ gte: INDEXER_PREFIX, lt: INDEXER_RANGE_END })
        if (!anyIndexer) {
          await view.put(`${INDEXER_PREFIX}${writerKeyHex}`, true)
          isIndexer = true
        }
      }

      if (entry.type === 'admin') {
        if (!isIndexer) {
          onInvalid({ reason: 'admin-from-non-indexer', node, entry })
          continue
        }
        await applyAdmin(entry, view, host)
        onApplied({ kind: 'admin', entry, node })
        continue
      }

      const id = entryId.encode({ writerKey, seq: node.length })
      const key = `${entry.type}/${entry.timestamp}/${id}`
      const stored = { ...entry, id, agent_id: entry.agent_id }
      await view.put(key, stored)
      onApplied({ kind: 'entry', entry: stored, node, key })
    }
  }
}

async function isIndexerKey(view, writerKeyHex) {
  const got = await view.get(`${INDEXER_PREFIX}${writerKeyHex}`)
  return got != null
}

async function applyAdmin(entry, view, host) {
  const keyBuf = b4a.from(entry.payload.key, 'hex')
  if (entry.payload.action === 'addWriter') {
    const indexer = !!entry.payload.indexer
    await host.addWriter(keyBuf, { indexer })
    if (indexer) {
      await view.put(`${INDEXER_PREFIX}${entry.payload.key}`, true)
    }
  } else if (entry.payload.action === 'removeWriter') {
    await host.removeWriter(keyBuf)
    await view.del(`${INDEXER_PREFIX}${entry.payload.key}`)
  }
}

function noop() {}

module.exports = { makeApply, INDEXER_PREFIX }
