import type { EntryType } from '../schemas/common'

// '/' is 0x2F, '0' is 0x30 — '<type>0' is the upper exclusive bound for
// the '<type>/' prefix scan.
function rangeFor(type: string): { gte: string; lt: string } {
  return { gte: `${type}/`, lt: `${type}0` }
}

export interface ListOpts {
  limit?: number
  /** Lexicographic key continuation; resumes after the given key. */
  after?: string
  /** When set, only entries whose stored value passes this predicate are returned. */
  filter?: (value: any) => boolean
}

/**
 * List entries of a given type from the Hyperbee view.
 * Returns entries in linearization order (the bee key prefix is
 * `<type>/<timestamp>/<entry-id>`, sorted lexicographically).
 */
export async function listByType(view: any, type: EntryType, opts: ListOpts = {}): Promise<any[]> {
  const { limit = 100, after, filter } = opts
  const range = rangeFor(type)
  const stream = view.createReadStream({
    gte: after ? `${type}/${after}\x00` : range.gte,
    lt: range.lt,
  })
  const out: any[] = []
  for await (const { value } of stream) {
    if (filter && !filter(value)) continue
    out.push(value)
    if (out.length >= limit) break
  }
  return out
}

/**
 * Look up a single entry by its logical entry ID within a type prefix.
 * Scan-and-filter — fine for Phase 1.3 view sizes. Optimize with a
 * secondary index in Phase 2.4 if perf matters.
 */
export async function getById(view: any, type: EntryType, id: string): Promise<any | null> {
  const range = rangeFor(type)
  for await (const { value } of view.createReadStream(range)) {
    if (value && value.id === id) return value
  }
  return null
}

/**
 * List all entries of a type whose `refs` array contains the given id.
 * Used by the task state reducer to gather a task's history.
 */
export async function findRefs(view: any, type: EntryType, refId: string): Promise<any[]> {
  const range = rangeFor(type)
  const out: any[] = []
  for await (const { value } of view.createReadStream(range)) {
    if (!value) continue
    if (value.id === refId) out.push(value)
    else if (Array.isArray(value.refs) && value.refs.includes(refId)) out.push(value)
  }
  return out
}

/**
 * Look up an entry by ID across every entry type. Single full-prefix
 * scan; fine for v0.1 view sizes. Returns the stored entry value or
 * null if the ID isn't found.
 */
export async function getEntryById(view: any, id: string): Promise<any | null> {
  for (const type of ENTRY_TYPES) {
    const found = await getById(view, type, id)
    if (found) return found
  }
  return null
}

/**
 * List all entries that reference the given target id, via the
 * reverse-ref index written by apply.ts (`ref/<target>/<source>` keys).
 * O(referenced-by-count), no full scan.
 */
export async function findReferencedBy(view: any, targetId: string): Promise<any[]> {
  const out: any[] = []
  const stream = view.createReadStream({
    gte: `ref/${targetId}/`,
    lt: `ref/${targetId}0`,
  })
  for await (const { value } of stream) {
    if (value) out.push(value)
  }
  return out
}

const ENTRY_TYPES: EntryType[] = ['knowledge', 'task', 'skill', 'message']
