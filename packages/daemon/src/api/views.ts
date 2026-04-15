import type { EntryType } from '../schemas/common'

/*
 * Hyperbee view-query helpers.
 *
 * Entries are stored under lex-sortable keys of the form
 * `<type>/<timestamp>/<entry-id>` (see apply.ts). Because ISO-8601
 * timestamps sort lexicographically, a `reverse: true` range scan
 * yields newest-first deterministically. This file centralises that
 * so every route gets the same ordering + pagination contract.
 */

// '/' is 0x2F, '0' is 0x30 — '<type>0' is the upper exclusive bound for
// the '<type>/' prefix scan.
function rangeFor(type: string): { gte: string; lt: string } {
  return { gte: `${type}/`, lt: `${type}0` }
}

export type Order = 'asc' | 'desc'

export interface ListPageOpts {
  /** Sort direction. Default 'desc' (newest first). */
  order?: Order
  /** Max entries in the returned page. Default 50, hard max 1000. */
  limit?: number
  /** Opaque continuation — the `cursor` from the previous page. */
  cursor?: string | null
  /** Post-stream predicate; values failing the predicate are skipped. */
  filter?: (value: any) => boolean
}

export interface ListPage<T> {
  entries: T[]
  /** Pass back into `listByType` to fetch the next page. `null` at end. */
  cursor: string | null
  /** `true` iff at least one more row exists past this page. */
  has_more: boolean
}

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 1000

/** Thrown when `cursor` is not a string that could plausibly be a Hyperbee key. */
export class BadCursorError extends Error {
  readonly code = 'BAD_CURSOR'
  constructor(msg = 'cursor is malformed') {
    super(msg)
    this.name = 'BadCursorError'
  }
}

/**
 * List entries of a given type. Returns a page envelope.
 *
 * Uses Hyperbee's native `reverse` flag so ordering happens at the
 * b-tree level, not client-side. A post-stream `filter` predicate is
 * supported for semantic filters that can't be pushed into the key
 * range (e.g. knowledge topic). The filter runs row-by-row; pagination
 * is done in JS so it stays correct even when many rows are rejected.
 *
 * Cursor encoding: the raw Hyperbee key of the last kept entry. Safe
 * to expose — keys are already opaque-ish identifiers and they only
 * make sense within this view.
 */
export async function listByType<T = any>(
  view: any,
  type: EntryType,
  opts: ListPageOpts = {},
): Promise<ListPage<T>> {
  const order: Order = opts.order ?? 'desc'
  const limit = clampLimit(opts.limit)
  const cursor = parseCursor(opts.cursor ?? null, type)
  const filter = opts.filter
  const range = rangeFor(type)

  const streamRange: Record<string, string> =
    order === 'desc'
      ? { gte: range.gte, lt: cursor ?? range.lt }
      : cursor
        ? { gt: cursor, lt: range.lt }
        : { gte: range.gte, lt: range.lt }

  const stream = view.createReadStream(streamRange, { reverse: order === 'desc' })

  const entries: T[] = []
  let lastKey: string | null = null
  for await (const { key, value } of stream) {
    if (filter && !filter(value)) continue
    entries.push(value as T)
    lastKey = String(key)
    if (entries.length >= limit) break
  }

  // Close the stream: if we broke early, tell the iterator to stop
  // pulling rows. Hyperbee streams expose `destroy()` for this. Safe
  // to call even after the loop exited naturally.
  if (typeof stream.destroy === 'function') stream.destroy()

  const has_more = await peekHasMore(view, range, order, lastKey)

  return {
    entries,
    cursor: lastKey,
    has_more,
  }
}

/**
 * One-shot "does anything remain past `lastKey`?" using Hyperbee's
 * native `peek`. Cheap: single b-tree seek, no stream. Skipped if the
 * page didn't fill (implying the stream already hit the range end).
 */
async function peekHasMore(
  view: any,
  range: { gte: string; lt: string },
  order: Order,
  lastKey: string | null,
): Promise<boolean> {
  if (lastKey === null) return false
  const peekRange =
    order === 'desc' ? { gte: range.gte, lt: lastKey } : { gt: lastKey, lt: range.lt }
  if (typeof view.peek === 'function') {
    const hit = await view.peek(peekRange, { reverse: order === 'desc' })
    return hit != null
  }
  // Fallback for views that don't expose peek: a 1-row read stream.
  for await (const _ of view.createReadStream(peekRange, {
    reverse: order === 'desc',
    limit: 1,
  })) {
    return true
  }
  return false
}

function clampLimit(n: number | undefined): number {
  if (n == null || !Number.isFinite(n) || n < 1) return DEFAULT_LIMIT
  return Math.min(Math.floor(n), MAX_LIMIT)
}

/**
 * Validate + normalise a caller-supplied cursor. Cursors must begin
 * with `<type>/` so a cursor issued against one resource can't be
 * smuggled into another.
 */
function parseCursor(cursor: string | null, type: EntryType): string | null {
  if (cursor == null) return null
  if (typeof cursor !== 'string' || cursor.length === 0) {
    throw new BadCursorError('cursor must be a non-empty string')
  }
  if (!cursor.startsWith(`${type}/`)) {
    throw new BadCursorError('cursor does not belong to this resource')
  }
  return cursor
}

/**
 * Look up a single entry by its logical entry ID within a type prefix.
 * Scan-and-filter — fine for v0.1 view sizes.
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
 * scan; fine for v0.1 view sizes.
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
