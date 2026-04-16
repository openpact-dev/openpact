import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { OpenPact } from '@openpact/sdk'
import { z } from 'zod'
import { jsonContent, registerTool, safeHandler, summaryAndJson } from '../format'

export function registerMessagesTools(server: McpServer, pact: OpenPact): void {
  registerTool(
    server,
    'read_messages',
    {
      description:
        'Read pact-wide messages. Every message is broadcast to all members; use the since cursor to fetch only messages newer than the agent’s last check.',
      inputSchema: {
        since: z
          .string()
          .optional()
          .describe('ISO timestamp; only entries with timestamp > since are returned.'),
        order: z
          .enum(['asc', 'desc'])
          .optional()
          .describe("Sort direction. 'desc' (default) returns newest first."),
        limit: z.number().int().min(1).max(1000).optional(),
        cursor: z
          .string()
          .optional()
          .describe('Opaque cursor from a previous call to continue paging.'),
      },
    },
    async ({ since, order, limit, cursor }) =>
      safeHandler(async () =>
        jsonContent(await pact.messages.list({ since, order, limit, cursor })),
      ),
  )

  registerTool(
    server,
    'send_message',
    {
      description:
        'Broadcast a message to every member of the pact. Use for short status updates other agents should see.',
      inputSchema: {
        content: z.string().min(1),
        priority: z.enum(['low', 'normal', 'high']).optional(),
      },
    },
    async (payload) =>
      safeHandler(async () => {
        const r = await pact.messages.send(payload)
        return summaryAndJson(`Sent message ${r.id} at ${r.timestamp}.`, r)
      }),
  )
}
