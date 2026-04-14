import type { FastifyInstance } from 'fastify'
import type { Daemon } from '../../daemon'
import { listByType } from '../views'
import { getTaskState, reduceTaskHistory, type TaskState } from '../tasks-state'
import { findRefs } from '../views'
import { HttpError } from '../errors'

const TASK_STATUSES = ['open', 'claimed', 'complete'] as const

const taskCreateSchema = {
  type: 'object',
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 200 },
    description: { type: 'string' },
  },
  required: ['title'],
  additionalProperties: true,
}

const completeSchema = {
  type: 'object',
  properties: {
    result: { type: ['string', 'null'] },
  },
  additionalProperties: false,
}

interface ListQuery {
  status?: 'open' | 'claimed' | 'complete'
  limit?: number
}

interface IdParams {
  id: string
}

export default async function tasksRoute(
  app: FastifyInstance,
  { daemon }: { daemon: Daemon },
): Promise<void> {
  app.get<{ Querystring: ListQuery }>(
    '/v1/tasks',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            status: { enum: TASK_STATUSES as unknown as string[] },
            limit: { type: 'integer', minimum: 1, maximum: 1000 },
          },
        },
      },
    },
    async (req) => {
      const { status, limit } = req.query
      // List originals (entries with no `refs`) and reduce each one's history.
      const originals = await listByType(daemon.view, 'task', {
        limit,
        filter: (v) => !v?.refs?.length,
      })
      const states: TaskState[] = []
      for (const original of originals) {
        const state = await getTaskState(daemon.view, original.id)
        if (state && (!status || state.status === status)) {
          states.push(state)
        }
      }
      return states
    },
  )

  app.post('/v1/tasks', { schema: { body: taskCreateSchema } }, async (req) => {
    const payload = req.body as { title: string; description?: string }
    const timestamp = new Date().toISOString()
    const result = await daemon.append({
      type: 'task',
      timestamp,
      agent_id: daemon.peerHandle!,
      payload: { ...payload, status: 'open' },
    })
    return { id: result.id, timestamp }
  })

  app.get<{ Params: IdParams }>('/v1/tasks/:id', async (req) => {
    const state = await getTaskState(daemon.view, req.params.id)
    if (!state) {
      throw new HttpError(404, 'NOT_FOUND', `task ${req.params.id} not found`)
    }
    return state
  })

  app.put<{ Params: IdParams }>('/v1/tasks/:id/claim', async (req) => {
    const taskId = req.params.id
    const before = await getTaskState(daemon.view, taskId)
    if (!before) throw new HttpError(404, 'NOT_FOUND', `task ${taskId} not found`)
    if (before.status !== 'open') {
      throw new HttpError(409, 'TASK_NOT_OPEN', `task ${taskId} is ${before.status}`)
    }
    const append = await daemon.append({
      type: 'task',
      timestamp: new Date().toISOString(),
      agent_id: daemon.peerHandle!,
      refs: [taskId],
      payload: {
        title: before.title,
        status: 'claimed',
        claimed_by: daemon.peerHandle,
      },
    })
    await daemon.update()
    const after = await waitForView(daemon, taskId, append.id)
    if (after.status !== 'claimed' || after.claimed_by !== daemon.peerHandle) {
      throw new HttpError(
        409,
        'TASK_ALREADY_CLAIMED',
        `lost claim race; current claimer ${after.claimed_by}`,
      )
    }
    return { ok: true, task: after }
  })

  app.put<{ Params: IdParams; Body: { result?: string | null } }>(
    '/v1/tasks/:id/complete',
    { schema: { body: completeSchema } },
    async (req) => {
      const taskId = req.params.id
      const before = await getTaskState(daemon.view, taskId)
      if (!before) throw new HttpError(404, 'NOT_FOUND', `task ${taskId} not found`)
      if (before.status === 'complete') {
        throw new HttpError(409, 'TASK_ALREADY_COMPLETE', `task ${taskId} is already complete`)
      }
      if (before.status === 'claimed' && before.claimed_by !== daemon.peerHandle) {
        throw new HttpError(
          409,
          'NOT_CLAIMER',
          `task ${taskId} is claimed by ${before.claimed_by}, not you`,
        )
      }
      const append = await daemon.append({
        type: 'task',
        timestamp: new Date().toISOString(),
        agent_id: daemon.peerHandle!,
        refs: [taskId],
        payload: {
          title: before.title,
          status: 'complete',
          claimed_by: before.claimed_by,
          result: req.body?.result ?? null,
        },
      })
      await daemon.update()
      const after = await waitForView(daemon, taskId, append.id)
      return { ok: true, task: after }
    },
  )

  app.put<{ Params: IdParams }>('/v1/tasks/:id/release', async (req) => {
    const taskId = req.params.id
    const before = await getTaskState(daemon.view, taskId)
    if (!before) throw new HttpError(404, 'NOT_FOUND', `task ${taskId} not found`)
    if (before.status !== 'claimed') {
      throw new HttpError(409, 'NOT_CLAIMED', `task ${taskId} is ${before.status}, not claimed`)
    }
    if (before.claimed_by !== daemon.peerHandle) {
      throw new HttpError(
        409,
        'NOT_CLAIMER',
        `task ${taskId} is claimed by ${before.claimed_by}, not you`,
      )
    }
    const append = await daemon.append({
      type: 'task',
      timestamp: new Date().toISOString(),
      agent_id: daemon.peerHandle!,
      refs: [taskId],
      payload: { title: before.title, status: 'open', claimed_by: null },
    })
    await daemon.update()
    const after = await waitForView(daemon, taskId, append.id)
    return { ok: true, task: after }
  })
}

/**
 * Wait until our just-appended entry is visible in the view, then return
 * the reduced task state. Bounded by a short timeout — autobase reflects
 * local writes very quickly.
 */
async function waitForView(daemon: Daemon, taskId: string, expectedId: string): Promise<TaskState> {
  const deadline = Date.now() + 2000
  while (Date.now() < deadline) {
    const entries = (await findRefs(daemon.view, 'task', taskId)) as any[]
    if (entries.some((e) => e.id === expectedId)) {
      const state = reduceTaskHistory(entries)
      if (state) return state
    }
    await new Promise((r) => setTimeout(r, 25))
  }
  // Fallback: return whatever we have so the caller can inspect.
  const state = await getTaskState(daemon.view, taskId)
  if (!state) throw new HttpError(500, 'INTERNAL', 'task vanished from view after append')
  return state
}
