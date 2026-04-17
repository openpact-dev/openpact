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
}

export function changesResource(client: OpenPactClient) {
  return {
    /**
     * `GET /v1/pacts/:pactId/changes` — cross-type change feed.
     *
     * Two patterns:
     *   1. **Bootstrap + tail**: first call with no `since` returns
     *      everything; keep paging with the returned cursor until
     *      `has_more === false`. Then loop with `wait=30` on the last
     *      cursor to receive new entries as they land.
     *   2. **Tail-only**: do a cheap `poll({ limit: 1 })`, take its
     *      cursor, then loop with that cursor + `wait=30` to skip
     *      history and only surface new activity.
     */
    poll(opts: PollOpts = {}): Promise<ChangesPage> {
      return client.req<ChangesPage>(
        client.pactPath(`/changes${buildQuery(opts as Record<string, unknown>)}`),
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
