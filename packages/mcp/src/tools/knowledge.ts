import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { OpenPact } from '@openpact/sdk'
import { z } from 'zod'
import { jsonContent, registerTool, safeHandler, summaryAndJson } from '../format'

export function registerKnowledgeTools(server: McpServer, pact: OpenPact): void {
  registerTool(
    server,
    'recall_knowledge',
    {
      description:
        'List recent knowledge entries in the pact, optionally filtered by topic. Use this at the start of a task to surface prior decisions, conventions, and gotchas.',
      inputSchema: {
        topic: z
          .string()
          .optional()
          .describe('Filter by exact topic string, e.g. "routing" or "auth".'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(1000)
          .optional()
          .describe('Maximum number of entries to return. Defaults to the daemon default.'),
      },
    },
    async ({ topic, limit }) =>
      safeHandler(async () => jsonContent(await pact.knowledge.list({ topic, limit }))),
  )

  registerTool(
    server,
    'record_knowledge',
    {
      description:
        'Share a discovery with the pact: a decision, a convention, a workaround, a tradeoff. Keep entries short (one fact per entry) and pick a reusable topic.',
      inputSchema: {
        topic: z
          .string()
          .min(1)
          .max(200)
          .describe('Short topic slug, e.g. "routing" or "db-schema".'),
        content: z.string().min(1).describe('One-sentence statement of the fact or decision.'),
        confidence: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe('Optional 0-1 score for how sure you are.'),
        source: z
          .string()
          .optional()
          .describe('Optional source reference (file path, PR link, doc URL).'),
      },
    },
    async (payload) =>
      safeHandler(async () => {
        const result = await pact.knowledge.create(payload)
        return summaryAndJson(
          `Recorded knowledge entry ${result.id} at ${result.timestamp}.`,
          result,
        )
      }),
  )
}
