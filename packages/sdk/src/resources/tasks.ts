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
    list(opts: TasksListOpts = {}): Promise<TaskState[]> {
      return client.req<TaskState[]>(
        client.pactPath(`/tasks${buildQuery(opts as Record<string, unknown>)}`),
      )
    },
    get(id: string): Promise<TaskState> {
      return client.req<TaskState>(client.pactPath(`/tasks/${encodeURIComponent(id)}`))
    },
    create(body: CreateTaskBody): Promise<AppendResult> {
      return client.json<AppendResult>(client.pactPath('/tasks'), 'POST', body)
    },
    claim(id: string): Promise<{ ok: true; task: TaskState }> {
      return client.json<{ ok: true; task: TaskState }>(
        client.pactPath(`/tasks/${encodeURIComponent(id)}/claim`),
        'PUT',
      )
    },
    complete(id: string, body: CompleteTaskBody = {}): Promise<{ ok: true; task: TaskState }> {
      return client.json<{ ok: true; task: TaskState }>(
        client.pactPath(`/tasks/${encodeURIComponent(id)}/complete`),
        'PUT',
        body,
      )
    },
    release(id: string): Promise<{ ok: true; task: TaskState }> {
      return client.json<{ ok: true; task: TaskState }>(
        client.pactPath(`/tasks/${encodeURIComponent(id)}/release`),
        'PUT',
      )
    },
  }
}
