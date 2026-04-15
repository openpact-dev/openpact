import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { OpenPact } from '@openpact/sdk'
import { z } from 'zod'
import { jsonContent, registerTool, safeHandler, summaryAndJson } from '../format'

const TASK_STATUS = z.enum(['open', 'claimed', 'complete'])

export function registerTasksTools(server: McpServer, pact: OpenPact): void {
  registerTool(
    server,
    'list_tasks',
    {
      description:
        'List tasks in the pact, optionally filtered by status. Each task is reduced to its current state (claimer, result, etc.).',
      inputSchema: {
        status: TASK_STATUS.optional().describe('Filter by status.'),
        limit: z.number().int().min(1).max(1000).optional(),
      },
    },
    async ({ status, limit }) =>
      safeHandler(async () => jsonContent(await pact.tasks.list({ status, limit }))),
  )

  registerTool(
    server,
    'get_task',
    {
      description:
        'Fetch a single task by id. Returns its full reduced state including claim and completion history.',
      inputSchema: {
        id: z.string().describe('Task id in the form <core>-<seq>, e.g. "a7f2-412".'),
      },
    },
    async ({ id }) => safeHandler(async () => jsonContent(await pact.tasks.get(id))),
  )

  registerTool(
    server,
    'create_task',
    {
      description:
        'Post a new open task to the pact. Use for work the user wants tracked across sessions.',
      inputSchema: {
        title: z.string().min(1).max(200).describe('Short imperative title.'),
        description: z.string().optional().describe('Optional longer description with context.'),
      },
    },
    async (body) =>
      safeHandler(async () => {
        const result = await pact.tasks.create(body)
        return summaryAndJson(`Created task ${result.id} at ${result.timestamp}.`, result)
      }),
  )

  registerTool(
    server,
    'claim_task',
    {
      description:
        'Claim an open task before working on it. Returns TASK_NOT_OPEN if another agent already owns it — pick a different task instead of retrying.',
      inputSchema: {
        id: z.string().describe('Task id to claim.'),
      },
    },
    async ({ id }) =>
      safeHandler(async () => {
        const result = await pact.tasks.claim(id)
        return summaryAndJson(`Claimed task ${id}.`, result.task)
      }),
  )

  registerTool(
    server,
    'complete_task',
    {
      description:
        'Mark a task complete with an optional result. Only the claimer (or an unclaimed-then-completed flow) can complete.',
      inputSchema: {
        id: z.string().describe('Task id to complete.'),
        result: z
          .string()
          .nullable()
          .optional()
          .describe('Optional one-line summary of what shipped (PR link, summary, etc.).'),
      },
    },
    async ({ id, result }) =>
      safeHandler(async () => {
        const r = await pact.tasks.complete(id, { result: result ?? null })
        return summaryAndJson(`Completed task ${id}.`, r.task)
      }),
  )

  registerTool(
    server,
    'release_task',
    {
      description:
        'Release a task this agent claimed back to open. Use when the agent cannot finish so other agents can pick it up.',
      inputSchema: {
        id: z.string().describe('Task id to release.'),
      },
    },
    async ({ id }) =>
      safeHandler(async () => {
        const r = await pact.tasks.release(id)
        return summaryAndJson(`Released task ${id} back to open.`, r.task)
      }),
  )
}
