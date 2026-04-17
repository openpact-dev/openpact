import { buildQuery, type OpenPactClient } from '../client'
import type { ListOpts, ListPage, TaskState, TaskStatus } from '../types'
import { paginate } from './paginate'

export interface TasksListOpts extends ListOpts {
  status?: TaskStatus
}

export interface CreateTaskBody {
  title: string
  description?: string
  /**
   * Peer handle the task is reserved for. When set, only that peer
   * may claim. Omit for an open-to-anyone task (the previous default).
   */
  assigned_to?: string
}

export interface CompleteTaskBody {
  result?: string | null
}

export function tasksResource(client: OpenPactClient) {
  const list = (opts: TasksListOpts = {}): Promise<ListPage<TaskState>> =>
    client.req<ListPage<TaskState>>(
      client.pactPath(`/tasks${buildQuery(opts as Record<string, unknown>)}`),
    )
  return {
    list,
    /** Walk every page; stops when `has_more` is false. */
    iterate(opts: TasksListOpts = {}): AsyncGenerator<TaskState> {
      return paginate<TaskState, TasksListOpts>(list, opts)
    },
    get(id: string): Promise<TaskState> {
      return client.req<TaskState>(client.pactPath(`/tasks/${encodeURIComponent(id)}`))
    },
    create(body: CreateTaskBody): Promise<TaskState> {
      return client.json<TaskState>(client.pactPath('/tasks'), 'POST', body)
    },
    claim(id: string): Promise<TaskState> {
      return client.json<TaskState>(
        client.pactPath(`/tasks/${encodeURIComponent(id)}/claim`),
        'PUT',
      )
    },
    complete(id: string, body: CompleteTaskBody = {}): Promise<TaskState> {
      return client.json<TaskState>(
        client.pactPath(`/tasks/${encodeURIComponent(id)}/complete`),
        'PUT',
        body,
      )
    },
    release(id: string): Promise<TaskState> {
      return client.json<TaskState>(
        client.pactPath(`/tasks/${encodeURIComponent(id)}/release`),
        'PUT',
      )
    },
  }
}
