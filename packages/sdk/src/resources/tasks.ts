import { buildQuery, type OpenPactClient } from '../client'
import type { AppendResult, TaskState, TaskStatus } from '../types'

export interface TasksListOpts {
  status?: TaskStatus
  limit?: number
}

export interface CreateTaskBody {
  title: string
  description?: string
}

export interface CompleteTaskBody {
  result?: string | null
}

export function tasksResource(client: OpenPactClient) {
  return {
    /** GET /v1/tasks — list tasks, optionally filtered by status. Reduced to current state. */
    list(opts: TasksListOpts = {}): Promise<TaskState[]> {
      return client.req<TaskState[]>(`/v1/tasks${buildQuery(opts as Record<string, unknown>)}`)
    },
    /** GET /v1/tasks/:id — fetch a single task with full claim history. */
    get(id: string): Promise<TaskState> {
      return client.req<TaskState>(`/v1/tasks/${encodeURIComponent(id)}`)
    },
    /** POST /v1/tasks — create a new open task. */
    create(body: CreateTaskBody): Promise<AppendResult> {
      return client.json<AppendResult>('/v1/tasks', 'POST', body)
    },
    /** PUT /v1/tasks/:id/claim — claim an open task. Throws TaskNotOpenError on race loss. */
    claim(id: string): Promise<{ ok: true; task: TaskState }> {
      return client.json<{ ok: true; task: TaskState }>(
        `/v1/tasks/${encodeURIComponent(id)}/claim`,
        'PUT',
      )
    },
    /** PUT /v1/tasks/:id/complete — complete a task. Claimer-only unless skip-claim. */
    complete(id: string, body: CompleteTaskBody = {}): Promise<{ ok: true; task: TaskState }> {
      return client.json<{ ok: true; task: TaskState }>(
        `/v1/tasks/${encodeURIComponent(id)}/complete`,
        'PUT',
        body,
      )
    },
    /** PUT /v1/tasks/:id/release — claimer reverts a claimed task to open. */
    release(id: string): Promise<{ ok: true; task: TaskState }> {
      return client.json<{ ok: true; task: TaskState }>(
        `/v1/tasks/${encodeURIComponent(id)}/release`,
        'PUT',
      )
    },
  }
}
