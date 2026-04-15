import type { FastifyInstance } from 'fastify'
import type { Daemon } from '../../daemon'
import type { Pact } from '../../pact'
import { listByType, BadCursorError } from '../views'
import { getTaskState, reduceTaskHistory, type TaskState, type ReduceOpts } from '../tasks-state'
import { findRefs } from '../views'
import { HttpError } from '../errors'
import { resolvePact } from '../pact-resolver'
import { LIST_PAGE_QUERY, type ListPageQuery } from '../schemas'

const TASK_STATUSES = ['open', 'claimed', 'complete'] as const

function ttlOpts(daemon: Daemon): ReduceOpts {
  return { ttlMs: daemon.claimTtlMs, clockMs: daemon.clockMs }
}

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

interface ListQuery extends ListPageQuery {
  status?: 'open' | 'claimed' | 'complete'
}

interface IdParams {
  pactId: string
  id: string
}

export default async function tasksRoute(
  app: FastifyInstance,
  { daemon }: { daemon: Daemon },
): Promise<void> {
  app.get<{ Params: { pactId: string }; Querystring: ListQuery }>(
    '/v1/pacts/:pactId/tasks',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            ...LIST_PAGE_QUERY,
            status: { enum: TASK_STATUSES as unknown as string[] },
          },
        },
      },
    },
    async (req) => {
      const pact = await resolvePact(daemon, req)
      const { status, order, limit, cursor } = req.query
      // Paginate over originals (the first-append per task). The
      // status filter runs after reducing each original's history,
      // which can only be determined post-reduce. If the status
      // filter rejects some, `entries` can be smaller than `limit` —
      // callers follow the page's `cursor` to keep walking.
      let page
      try {
        page = await listByType(pact.view, 'task', {
          order,
          limit,
          cursor: cursor ?? null,
          filter: (v) => !v?.refs?.length,
        })
      } catch (err) {
        if (err instanceof BadCursorError) {
          throw new HttpError(400, 'BAD_CURSOR', err.message)
        }
        throw err
      }
      const states: TaskState[] = []
      for (const original of page.entries) {
        const state = await getTaskState(pact.view, (original as any).id, ttlOpts(daemon))
        if (state && (!status || state.status === status)) {
          states.push(state)
        }
      }
      return {
        entries: states,
        cursor: page.cursor,
        has_more: page.has_more,
      }
    },
  )

  app.post<{ Params: { pactId: string } }>(
    '/v1/pacts/:pactId/tasks',
    { schema: { body: taskCreateSchema } },
    async (req) => {
      const pact = await resolvePact(daemon, req)
      const payload = req.body as { title: string; description?: string }
      const timestamp = new Date().toISOString()
      const result = await pact.append({
        type: 'task',
        timestamp,
        agent_id: pact.peerHandle!,
        display_name: pact.displayName,
        payload: { ...payload, status: 'open' },
      })
      return { id: result.id, timestamp }
    },
  )

  app.get<{ Params: IdParams }>('/v1/pacts/:pactId/tasks/:id', async (req) => {
    const pact = await resolvePact(daemon, req)
    const state = await getTaskState(pact.view, req.params.id)
    if (!state) {
      throw new HttpError(404, 'NOT_FOUND', `task ${req.params.id} not found`)
    }
    return state
  })

  app.put<{ Params: IdParams }>('/v1/pacts/:pactId/tasks/:id/claim', async (req) => {
    const pact = await resolvePact(daemon, req)
    const taskId = req.params.id
    const before = await getTaskState(pact.view, taskId, ttlOpts(daemon))
    if (!before) throw new HttpError(404, 'NOT_FOUND', `task ${taskId} not found`)
    if (before.status !== 'open') {
      throw new HttpError(409, 'TASK_NOT_OPEN', `task ${taskId} is ${before.status}`)
    }
    const append = await pact.append({
      type: 'task',
      timestamp: new Date().toISOString(),
      agent_id: pact.peerHandle!,
      display_name: pact.displayName,
      refs: [taskId],
      payload: {
        title: before.title,
        status: 'claimed',
        claimed_by: pact.peerHandle,
      },
    })
    await pact.update()
    const after = await waitForView(pact, daemon, taskId, append.id)
    if (after.status !== 'claimed' || after.claimed_by !== pact.peerHandle) {
      throw new HttpError(
        409,
        'TASK_ALREADY_CLAIMED',
        `lost claim race; current claimer ${after.claimed_by}`,
      )
    }
    return { ok: true, task: after }
  })

  app.put<{ Params: IdParams; Body: { result?: string | null } }>(
    '/v1/pacts/:pactId/tasks/:id/complete',
    { schema: { body: completeSchema } },
    async (req) => {
      const pact = await resolvePact(daemon, req)
      const taskId = req.params.id
      const before = await getTaskState(pact.view, taskId, ttlOpts(daemon))
      if (!before) throw new HttpError(404, 'NOT_FOUND', `task ${taskId} not found`)
      if (before.status === 'complete') {
        throw new HttpError(409, 'TASK_ALREADY_COMPLETE', `task ${taskId} is already complete`)
      }
      if (before.status === 'claimed' && before.claimed_by !== pact.peerHandle) {
        throw new HttpError(
          409,
          'NOT_CLAIMER',
          `task ${taskId} is claimed by ${before.claimed_by}, not ${pact.peerHandle}`,
        )
      }
      const append = await pact.append({
        type: 'task',
        timestamp: new Date().toISOString(),
        agent_id: pact.peerHandle!,
        display_name: pact.displayName,
        refs: [taskId],
        payload: {
          title: before.title,
          status: 'complete',
          claimed_by: before.claimed_by,
          result: req.body?.result ?? null,
        },
      })
      await pact.update()
      const after = await waitForView(pact, daemon, taskId, append.id)
      return { ok: true, task: after }
    },
  )

  app.put<{ Params: IdParams }>('/v1/pacts/:pactId/tasks/:id/release', async (req) => {
    const pact = await resolvePact(daemon, req)
    const taskId = req.params.id
    const before = await getTaskState(pact.view, taskId, ttlOpts(daemon))
    if (!before) throw new HttpError(404, 'NOT_FOUND', `task ${taskId} not found`)
    if (before.status !== 'claimed') {
      throw new HttpError(409, 'NOT_CLAIMED', `task ${taskId} is ${before.status}, not claimed`)
    }
    if (before.claimed_by !== pact.peerHandle) {
      throw new HttpError(
        409,
        'NOT_CLAIMER',
        `task ${taskId} is claimed by ${before.claimed_by}, not you`,
      )
    }
    const append = await pact.append({
      type: 'task',
      timestamp: new Date().toISOString(),
      agent_id: pact.peerHandle!,
      display_name: pact.displayName,
      refs: [taskId],
      payload: { title: before.title, status: 'open', claimed_by: null },
    })
    await pact.update()
    const after = await waitForView(pact, daemon, taskId, append.id)
    return { ok: true, task: after }
  })
}

async function waitForView(
  pact: Pact,
  daemon: Daemon,
  taskId: string,
  expectedId: string,
): Promise<TaskState> {
  const opts = ttlOpts(daemon)
  const deadline = Date.now() + 2000
  while (Date.now() < deadline) {
    const entries = (await findRefs(pact.view, 'task', taskId)) as any[]
    if (entries.some((e) => e.id === expectedId)) {
      const state = reduceTaskHistory(entries, opts)
      if (state) return state
    }
    await new Promise((r) => setTimeout(r, 25))
  }
  const state = await getTaskState(pact.view, taskId, opts)
  if (!state) throw new HttpError(500, 'INTERNAL', 'task vanished from view after append')
  return state
}
