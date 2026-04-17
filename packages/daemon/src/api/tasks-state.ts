import { findRefs } from './views'

export type TaskStatus = 'open' | 'claimed' | 'complete'

export interface TaskEntry {
  id: string
  type: 'task'
  timestamp: string
  agent_id: string
  /**
   * Author display name at the time of writing. `apply.ts` persists
   * this alongside the canonical `agent_id` so downstream consumers
   * (dashboard task timeline, Claude's task history dump) can show a
   * friendlier name without a separate roster lookup.
   */
  display_name?: string | null
  refs?: string[]
  payload: {
    title: string
    description?: string
    status: TaskStatus
    claimed_by?: string | null
    result?: string | null
    /**
     * Peer handle the task is reserved for. Set on the original
     * create entry; the reducer ignores claim entries from anyone
     * else, keeping the assignment deterministic across peers.
     */
    assigned_to?: string | null
  }
}

export interface TaskState {
  id: string
  title: string
  description?: string
  status: TaskStatus
  claimed_by: string | null
  /** Peer handle the task is reserved for, if any. Never mutates after create. */
  assigned_to: string | null
  result: string | null
  /**
   * ISO timestamp of the original task-create entry. Stable across the
   * task's lifetime. Populated from `history[0].timestamp` by the
   * reducer; callers can treat this as the task's `created_at`.
   */
  timestamp: string
  /**
   * ISO timestamp of the most recent entry in the history — i.e. the
   * last state transition. Use when you want "what happened last to
   * this task" (claim, complete, release). Equals `timestamp` for
   * never-updated tasks.
   */
  updated_at: string
  /** ISO timestamp of the entry that established the current `claimed` status (if any). */
  claimed_at: string | null
  /**
   * Set when the route layer observes that a `claimed` task has timed
   * out (`now - claimed_at > claimTtlMs`). When set, status is reported
   * as `open` and `claimed_by` as null, but `history` retains the
   * original claim entry. New claims are accepted from any agent.
   */
  expired_at: string | null
  history: TaskEntry[]
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000

export interface ReduceOpts {
  /** TTL after which a `claimed` task is considered open by the reducer. */
  ttlMs?: number
  /** Wall-clock used for the post-reduction "is the current claim past TTL by now?" check. */
  clockMs?: () => number
}

/**
 * Reduce a task's history into its current state.
 *
 * Determinism rule: when multiple writers race (e.g. two `claimed`
 * entries against the same `open` task), the winner is the entry with
 * the lexicographically EARLIEST entry ID. Entry IDs are
 * `<core-short>-<seq>` and are deterministic across all peers; every
 * peer reduces to the same final state.
 *
 * TTL rule: when processing entry E_n, "now" for the purpose of
 * deciding whether the previous claim has expired is `E_n.timestamp`.
 * This keeps the reducer deterministic across all peers given the
 * same entry stream and the same `ttlMs`. After reduction, an
 * additional wall-clock check ("is the current claim *now* past
 * TTL?") sets `expired_at` for the route layer to report — that
 * check is observer-time but never affects the reduced history.
 *
 * Lifecycle:
 *   open  → claimed (first claim wins; later claims ignored)
 *   claimed → complete (only the claimer can complete)
 *   claimed → open (only the claimer can release)
 *   open → complete (skip-claim) — allowed when written by anyone
 *   claimed (TTL elapsed) → claimable by anyone (the prior claim
 *     is treated as if it had expired the moment a new one lands)
 */
export function reduceTaskHistory(entries: TaskEntry[], opts: ReduceOpts = {}): TaskState | null {
  if (entries.length === 0) return null
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS
  const clockMs = opts.clockMs ?? Date.now

  // Sort deterministically by entry ID.
  const ordered = [...entries].sort((a, b) => a.id.localeCompare(b.id))

  // The original is the entry with no refs (others reference it via refs).
  const original = ordered.find((e) => !(e.refs ?? []).length)
  if (!original) return null // malformed history

  let state: TaskState = {
    id: original.id,
    title: original.payload.title,
    description: original.payload.description,
    status: original.payload.status,
    claimed_by: original.payload.claimed_by ?? null,
    assigned_to: original.payload.assigned_to ?? null,
    result: original.payload.result ?? null,
    // `timestamp` / `updated_at` mirror the rest of the list-endpoint
    // contract (knowledge/skill/message). updated_at picks the max
    // timestamp from history rather than `ordered[-1]` so cross-writer
    // histories (which sort by entry-id, not time) still surface the
    // chronologically latest write.
    timestamp: original.timestamp,
    updated_at: ordered.reduce(
      (max, e) => (e.timestamp > max ? e.timestamp : max),
      original.timestamp,
    ),
    claimed_at: null,
    expired_at: null,
    history: ordered,
  }

  for (const update of ordered) {
    if (update.id === original.id) continue
    state = applyTaskUpdate(state, update, ttlMs)
  }

  // Wall-clock TTL check: if the current claim is past TTL right now,
  // surface it to the route layer as effectively open.
  if (state.status === 'claimed' && state.claimed_at) {
    const claimedAtMs = Date.parse(state.claimed_at)
    const now = clockMs()
    if (Number.isFinite(claimedAtMs) && now - claimedAtMs > ttlMs) {
      return {
        ...state,
        status: 'open',
        claimed_by: null,
        expired_at: new Date(claimedAtMs + ttlMs).toISOString(),
      }
    }
  }

  return state
}

function applyTaskUpdate(state: TaskState, update: TaskEntry, ttlMs: number): TaskState {
  const next = update.payload.status

  // Has the current claim expired as of this incoming entry?
  const claimExpiredByEntry =
    state.status === 'claimed' &&
    state.claimed_at != null &&
    Date.parse(update.timestamp) - Date.parse(state.claimed_at) > ttlMs

  if (next === 'claimed') {
    // First claim against an open (or expired-claimed) task wins.
    //
    // `claimed_by` is always the writer's canonical agent_id — apply()
    // guarantees agent_id matches the writer key, so a peer cannot
    // claim a task on someone else's behalf. `update.payload.claimed_by`
    // is informational only; the authoritative value is `update.agent_id`.
    //
    // If the task is `assigned_to` a specific peer, claims from anyone
    // else are dropped here (deterministic across replicas) — the HTTP
    // layer rejects the same attempt with 409 NOT_ASSIGNEE first, but
    // apply-level enforcement is what makes the assignment tamper-
    // resistant against a misbehaving writer.
    if (state.status === 'open' || claimExpiredByEntry) {
      if (state.assigned_to && update.agent_id !== state.assigned_to) {
        return state
      }
      return {
        ...state,
        status: 'claimed',
        claimed_by: update.agent_id,
        claimed_at: update.timestamp,
      }
    }
    return state
  }

  if (next === 'complete') {
    // Skip-claim from open: anyone may complete.
    if (state.status === 'open') {
      return { ...state, status: 'complete', result: update.payload.result ?? null }
    }
    // Past-TTL claim → behaves like open: anyone may complete.
    if (claimExpiredByEntry) {
      return {
        ...state,
        status: 'complete',
        claimed_by: null,
        result: update.payload.result ?? null,
      }
    }
    // Active claim: only the claimer may complete.
    if (state.status === 'claimed' && update.agent_id === state.claimed_by) {
      return { ...state, status: 'complete', result: update.payload.result ?? null }
    }
    return state
  }

  if (next === 'open') {
    // Release: only the (active) claimer may revert to open.
    if (
      state.status === 'claimed' &&
      !claimExpiredByEntry &&
      update.agent_id === state.claimed_by
    ) {
      return { ...state, status: 'open', claimed_by: null, claimed_at: null }
    }
    return state
  }

  return state
}

/**
 * Look up a task's current state by ID from the daemon's view.
 */
export async function getTaskState(
  view: any,
  taskId: string,
  opts: ReduceOpts = {},
): Promise<TaskState | null> {
  const entries = (await findRefs(view, 'task', taskId)) as unknown as TaskEntry[]
  return reduceTaskHistory(entries, opts)
}
