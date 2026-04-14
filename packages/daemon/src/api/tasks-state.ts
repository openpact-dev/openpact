import { findRefs } from './views'

export type TaskStatus = 'open' | 'claimed' | 'complete'

export interface TaskEntry {
  id: string
  type: 'task'
  timestamp: string
  agent_id: string
  refs?: string[]
  payload: {
    title: string
    description?: string
    status: TaskStatus
    claimed_by?: string | null
    result?: string | null
  }
}

export interface TaskState {
  id: string
  title: string
  description?: string
  status: TaskStatus
  claimed_by: string | null
  result: string | null
  history: TaskEntry[]
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
 * Lifecycle:
 *   open  → claimed (first claim wins; later claims ignored)
 *   claimed → complete (only the claimer can complete)
 *   claimed → open (only the claimer can release)
 *   open → complete (skip-claim) — allowed when written by anyone
 */
export function reduceTaskHistory(entries: TaskEntry[]): TaskState | null {
  if (entries.length === 0) return null

  // Sort deterministically by entry ID.
  const ordered = [...entries].sort((a, b) => a.id.localeCompare(b.id))

  // The original is the entry with id == taskId. Within `findRefs`, this is
  // the entry whose `id` matches the search id (others reference it via refs).
  // The first ordered entry should be the original; verify and pick it.
  const original = ordered.find((e) => !(e.refs ?? []).length)
  if (!original) return null // malformed history

  let state: TaskState = {
    id: original.id,
    title: original.payload.title,
    description: original.payload.description,
    status: original.payload.status,
    claimed_by: original.payload.claimed_by ?? null,
    result: original.payload.result ?? null,
    history: ordered,
  }

  for (const update of ordered) {
    if (update.id === original.id) continue
    state = applyTaskUpdate(state, update)
  }
  return state
}

function applyTaskUpdate(state: TaskState, update: TaskEntry): TaskState {
  const next = update.payload.status

  if (next === 'claimed') {
    // First claim against an open task wins; any later claim is ignored.
    if (state.status !== 'open') return state
    return {
      ...state,
      status: 'claimed',
      claimed_by: update.payload.claimed_by ?? update.agent_id,
    }
  }

  if (next === 'complete') {
    // Allowed from open (skip-claim by anyone) or from claimed (claimer only).
    if (state.status === 'open') {
      return { ...state, status: 'complete', result: update.payload.result ?? null }
    }
    if (state.status === 'claimed' && update.agent_id === state.claimed_by) {
      return { ...state, status: 'complete', result: update.payload.result ?? null }
    }
    return state
  }

  if (next === 'open') {
    // Release: only the claimer can revert to open.
    if (state.status === 'claimed' && update.agent_id === state.claimed_by) {
      return { ...state, status: 'open', claimed_by: null }
    }
    return state
  }

  return state
}

/**
 * Look up a task's current state by ID from the daemon's view.
 */
export async function getTaskState(view: any, taskId: string): Promise<TaskState | null> {
  const entries = (await findRefs(view, 'task', taskId)) as TaskEntry[]
  return reduceTaskHistory(entries)
}
