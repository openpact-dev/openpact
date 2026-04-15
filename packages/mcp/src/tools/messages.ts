import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { OpenPact } from '@openpact/sdk'
import { z } from 'zod'
import { jsonContent, registerTool, safeHandler, summaryAndJson } from '../format'

const PEER_HANDLE = z.string().regex(/^anon-[a-z]+-[0-9a-f]{4}$|^\*$/)

export function registerMessagesTools(server: McpServer, pact: OpenPact): void {
  registerTool(
    server,
    'read_messages',
    {
      description:
        'Read messages from the pact. Use the since cursor to fetch only messages newer than the agent’s last check.',
      inputSchema: {
        since: z
          .string()
          .optional()
          .describe('ISO timestamp; only entries with timestamp > since are returned.'),
        to: PEER_HANDLE.optional().describe(
          'Filter by recipient handle ("anon-foo-1234") or "*" for broadcasts.',
        ),
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
    async ({ since, to, order, limit, cursor }) =>
      safeHandler(async () =>
        jsonContent(await pact.messages.list({ since, to, order, limit, cursor })),
      ),
  )

  registerTool(
    server,
    'send_message',
    {
      description:
        'Send a message to "*" (broadcast) or a specific peer handle. Use for short status updates other agents should see.',
      inputSchema: {
        to: PEER_HANDLE.describe('"*" for broadcast or a specific peer handle.'),
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
