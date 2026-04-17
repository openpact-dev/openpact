import type { FastifyInstance } from 'fastify'
import type { Daemon } from '../../daemon'
import type { EntryType } from '../../schemas/common'
import type { StoredEntry, View } from '../views'
import { HttpError } from '../errors'
import { resolvePact } from '../pact-resolver'

/**
 * Entry types a `/changes` consumer sees. Admin + invite-redeemed are
 * infrastructure entries stored under `_invites/` / `_members/` keys,
 * not under `<type>/...`, so they're invisible here by design — the
 * change feed is the agent-coordination surface, not the audit log.
 */
const USER_FACING: EntryType[] = ['knowledge', 'task', 'skill', 'message']

/**
 * Upper bound on `?wait=`. Aligns with the daemon's default 30s
 * `requestTimeout`; asking for longer would just get reaped mid-poll.
 * Shorter polls + re-connect is the idiomatic shape anyway.
 */
const MAX_WAIT_SECONDS = 30
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 1000

interface ChangesQuery {
  since?: string
  wait?: number
  limit?: number
  type?: EntryType
}

interface ParsedCursor {
  ts: string
  id: string
}

function parseCursor(raw: string | undefined): ParsedCursor | null {
  if (!raw) return null
  const sep = raw.indexOf('|')
  if (sep < 0) {
    throw new HttpError(400, 'BAD_CURSOR', 'cursor must be "<timestamp>|<id>"')
  }
  const ts = raw.slice(0, sep)
  const id = raw.slice(sep + 1)
  if (!ts || !id) {
    throw new HttpError(400, 'BAD_CURSOR', 'cursor must be "<timestamp>|<id>"')
  }
  return { ts, id }
}

function encodeCursor(entry: { timestamp: string; id: string }): string {
  return `${entry.timestamp}|${entry.id}`
}

function afterCursor(entry: StoredEntry, cursor: ParsedCursor): boolean {
  const ts = (entry as { timestamp?: string }).timestamp ?? ''
  const id = (entry as { id?: string }).id ?? ''
  if (ts > cursor.ts) return true
  if (ts < cursor.ts) return false
  return id > cursor.id
}

function byTsThenId(a: StoredEntry, b: StoredEntry): number {
  const at = (a as { timestamp?: string }).timestamp ?? ''
  const bt = (b as { timestamp?: string }).timestamp ?? ''
  if (at !== bt) return at < bt ? -1 : 1
  const ai = (a as { id?: string }).id ?? ''
  const bi = (b as { id?: string }).id ?? ''
  if (ai !== bi) return ai < bi ? -1 : 1
  return 0
}

interface ChangesPage {
  entries: StoredEntry[]
  cursor: string | null
  has_more: boolean
}

/**
 * Cross-type scan of the view: walk every `<type>/...` range for the
 * requested types, keep entries past the cursor, sort by
 * `(timestamp, id)` ascending, return the first `limit` rows.
 *
 * O(n) per call in the total number of entries in those ranges. Fine
 * for v0.1-sized pacts. A later improvement is a dedicated monotonic
 * changelog index maintained in apply() so the scan becomes O(limit).
 *
 * Known caveat: the cursor is a wall-clock timestamp + entry id, and
 * late-arriving remote entries (clock skew, slow replication) land in
 * the view with their original timestamp. A consumer that has already
 * advanced past that timestamp won't see them. Agents that need
 * exact-once semantics across peers should dedupe by id on their side.
 */
async function readChangesOnce(
  view: View,
  types: EntryType[],
  cursor: ParsedCursor | null,
  limit: number,
  fallbackCursor: string | null,
): Promise<ChangesPage> {
  const all: StoredEntry[] = []
  for (const type of types) {
    const stream = view.createReadStream({ gte: `${type}/`, lt: `${type}0` })
    for await (const { value } of stream) {
      if (value == null || typeof value !== 'object') continue
      const entry = value as StoredEntry
      if (cursor && !afterCursor(entry, cursor)) continue
      all.push(entry)
    }
  }
  all.sort(byTsThenId)
  const page = all.slice(0, limit)
  const has_more = all.length > limit
  const last = page[page.length - 1] as { timestamp?: string; id?: string } | undefined
  const nextCursor =
    last && typeof last.timestamp === 'string' && typeof last.id === 'string'
      ? encodeCursor({ timestamp: last.timestamp, id: last.id })
      : fallbackCursor
  return { entries: page, cursor: nextCursor, has_more }
}

export default async function changesRoute(
  app: FastifyInstance,
  { daemon }: { daemon: Daemon },
): Promise<void> {
  app.get<{ Params: { pactId: string }; Querystring: ChangesQuery }>(
    '/v1/pacts/:pactId/changes',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            since: { type: 'string', minLength: 3, maxLength: 512 },
            wait: { type: 'integer', minimum: 0, maximum: MAX_WAIT_SECONDS },
            limit: { type: 'integer', minimum: 1, maximum: MAX_LIMIT },
            type: { enum: USER_FACING as unknown as string[] },
          },
        },
      },
    },
    async (req) => {
      const pact = await resolvePact(daemon, req)
      const cursor = parseCursor(req.query.since)
      const limit = req.query.limit ?? DEFAULT_LIMIT
      const waitSec = req.query.wait ?? 0
      const types = req.query.type ? [req.query.type] : USER_FACING
      const fallbackCursor = req.query.since ?? null

      const first = await readChangesOnce(pact.view, types, cursor, limit, fallbackCursor)
      if (first.entries.length > 0 || waitSec === 0) {
        return first
      }

      // Long-poll: sleep until an entry-applied event for this pact
      // or the wait window elapses, then re-scan. One re-scan is
      // enough — if a burst lands the cursor still advances to the
      // last entry we return; the caller loops with the new cursor.
      // Wake on the daemon's `update` envelope, not `entry-applied`.
      // `entry-applied` fires inside apply() right after the view's
      // local put, but autobase may not have committed the updated
      // view index to Hyperbee yet — a rescan that early can miss
      // the row we just put. `update` fires after the commit, so any
      // subsequent read is guaranteed to see the new entries.
      const pactKey = pact.pactKey
      await new Promise<void>((resolve) => {
        let done = false
        const finish = (): void => {
          if (done) return
          done = true
          clearTimeout(timer)
          daemon.off('update', onUpdate)
          req.raw.off('close', onClose)
          resolve()
        }
        const timer = setTimeout(finish, waitSec * 1000)
        const onUpdate = (info: { pactId?: string }): void => {
          if (info?.pactId === pactKey) finish()
        }
        const onClose = (): void => finish()
        daemon.on('update', onUpdate)
        req.raw.once('close', onClose)
      })

      return readChangesOnce(pact.view, types, cursor, limit, fallbackCursor)
    },
  )
}
