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
    // Optional peer handle the task is reserved for. Only that peer
    // can claim; everyone else gets 409 NOT_ASSIGNEE at the claim
    // endpoint, and the reducer drops their claim entry anyway.
    assigned_to: { type: 'string', pattern: '^anon-[a-z]+-[0-9a-f]{8}$' },
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
          filter: (v: unknown) => {
            const entry = v as { refs?: unknown[] } | null
            return !entry?.refs || entry.refs.length === 0
          },
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
      const payload = req.body as {
        title: string
        description?: string
        assigned_to?: string
      }
      const timestamp = new Date().toISOString()
      const result = await pact.append({
        type: 'task',
        timestamp,
        agent_id: pact.peerHandle!,
        display_name: pact.displayName,
        payload: { ...payload, status: 'open' },
      })
      await pact.update()
      return await waitForView(pact, daemon, result.id, result.id)
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
    if (before.assigned_to && before.assigned_to !== pact.peerHandle) {
      throw new HttpError(
        409,
        'NOT_ASSIGNEE',
        `task ${taskId} is assigned to ${before.assigned_to}, not ${pact.peerHandle}`,
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
    return after
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
      return await waitForView(pact, daemon, taskId, append.id)
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
    return await waitForView(pact, daemon, taskId, append.id)
  })
}

const VIEW_WAIT_MS = 2000

/**
 * Block until the caller's just-appended entry lands on the local
 * Autobase view. Under healthy conditions this resolves in a few ms
 * — the entry was written to our own core, so the next update tick
 * indexes it. Under pathological conditions (autobase stalled, view
 * reducer throwing, disk pressure) the entry never arrives; rather
 * than silently returning a stale state, surface a 504 VIEW_TIMEOUT
 * so SDK clients can map it to a dedicated `ViewTimeoutError` and
 * retry or back off.
 */
async function waitForView(
  pact: Pact,
  daemon: Daemon,
  taskId: string,
  expectedId: string,
): Promise<TaskState> {
  const opts = ttlOpts(daemon)
  const deadline = Date.now() + VIEW_WAIT_MS
  while (Date.now() < deadline) {
    const entries = (await findRefs(pact.view, 'task', taskId)) as any[]
    if (entries.some((e) => e.id === expectedId)) {
      const state = reduceTaskHistory(entries, opts)
      if (state) return state
    }
    await new Promise((r) => setTimeout(r, 25))
  }
  throw new HttpError(
    504,
    'VIEW_TIMEOUT',
    `entry ${expectedId} for task ${taskId} did not land on the local view within ${VIEW_WAIT_MS}ms`,
  )
}
