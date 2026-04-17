import { buildQuery, type OpenPactClient } from '../client'
import type { EntryType, KnowledgeEntry, MessageEntry, SkillEntry, TaskEntry } from '../types'

/** Any of the four user-facing entry shapes returned by `/changes`. */
export type ChangesEntry = KnowledgeEntry | TaskEntry | SkillEntry | MessageEntry

export interface ChangesPage {
  entries: ChangesEntry[]
  /**
   * Opaque `<timestamp>|<id>` cursor. Pass back as `since` to fetch
   * everything that lands after these entries. `null` only for empty
   * pacts with no initial `since` supplied.
   */
  cursor: string | null
  has_more: boolean
}

export interface PollOpts {
  /**
   * Cursor from a previous `poll()` response. Omit to start from the
   * beginning of the pact (full replay up to `limit`).
   */
  since?: string | null
  /**
   * Max seconds the daemon blocks if no new entries exist past
   * `since`. 0 (default) returns immediately. Clamped by the daemon
   * to `[0, 30]`.
   */
  wait?: number
  /** Cap on entries per page. 1–1000; daemon default 50. */
  limit?: number
  /** Filter to a single entry type. Omit for all four user-facing types. */
  type?: EntryType
  /**
   * Seek sentinel. `'head'` returns an empty page carrying the
   * current head cursor — the drain-to-HEAD shortcut for tail-only
   * consumers. When set, `since` and `wait` are ignored by the
   * daemon. Prefer `seekHead()` below for the typed helper.
   */
  from?: 'head'
}

export function changesResource(client: OpenPactClient) {
  return {
    /**
     * `GET /v1/pacts/:pactId/changes` — cross-type change feed.
     *
     * The feed is **chronological (oldest-first)** — a caller with
     * no `since` sees the full history replayed, not the latest
     * entry. That makes it a replay primitive, not a discovery one.
     *
     * Two patterns:
     *   1. **Bootstrap + tail**: first call with no `since` returns
     *      everything; keep paging with the returned cursor until
     *      `has_more === false`. Then loop with `wait=30` on the last
     *      cursor to receive new entries as they land. Best when you
     *      actually need the replay (auditor, backfill).
     *   2. **Tail-only**: call `seekHead()` once to skip the replay,
     *      then loop `poll({ since, wait })` to surface new activity
     *      from that point forward. Best for agents that just want to
     *      wake on peer activity.
     *
     * To **find** existing state (open tasks, recent messages,
     * knowledge on a topic) use the typed list endpoints — `.tasks`,
     * `.messages`, `.knowledge` — not this.
     */
    poll(opts: PollOpts = {}): Promise<ChangesPage> {
      return client.req<ChangesPage>(
        client.pactPath(`/changes${buildQuery(opts as Record<string, unknown>)}`),
      )
    },

    /**
     * One-shot seek to the current head of the feed. Returns a cursor
     * you can pass to `poll({ since, wait })` to long-poll for new
     * activity only, without replaying history.
     *
     *   const { cursor } = await pact.changes.seekHead()
     *   while (true) {
     *     const page = await pact.changes.poll({ since: cursor, wait: 30 })
     *     if (page.entries.length) handle(page.entries)
     *     cursor = page.cursor ?? cursor
     *   }
     */
    seekHead(opts: { type?: EntryType } = {}): Promise<ChangesPage> {
      return client.req<ChangesPage>(
        client.pactPath(
          `/changes${buildQuery({ from: 'head', type: opts.type } as Record<string, unknown>)}`,
        ),
      )
    },

    /**
     * Async iterator that walks bootstrap history fast (wait=0) then
     * long-polls for new entries forever. Exits when the caller breaks
     * out or when `signal` is aborted.
     *
     * Each yield is one non-empty batch in chronological order. Empty
     * tail-poll timeouts don't yield; they loop internally.
     */
    async *stream(
      opts: Omit<PollOpts, 'wait'> & { waitSeconds?: number; signal?: AbortSignal } = {},
    ): AsyncGenerator<ChangesPage> {
      const waitSeconds = opts.waitSeconds ?? 30
      let cursor = opts.since ?? null
      let bootstrapping = true
      while (!opts.signal?.aborted) {
        const page: ChangesPage = await this.poll({
          since: cursor ?? undefined,
          limit: opts.limit,
          type: opts.type,
          wait: bootstrapping ? 0 : waitSeconds,
        })
        if (page.entries.length > 0) {
          yield page
          cursor = page.cursor
          // Remain in bootstrap mode while more history is paged in;
          // once has_more is false, next iter long-polls for new stuff.
          bootstrapping = page.has_more
          continue
        }
        // Empty page — either the pact is empty (bootstrap) or the
        // long-poll timed out with nothing new. Either way, next
        // iteration should be a long-poll.
        bootstrapping = false
      }
    },
  }
}
