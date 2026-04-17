import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { OpenPact } from '@openpact/sdk'
import { z } from 'zod'
import { jsonContent, registerTool, safeHandler } from '../format'

/**
 * Wraps the daemon's cross-type long-poll `/v1/pacts/:pactId/changes`
 * endpoint. Returns a `{ entries, cursor, has_more }` page of new
 * entries across knowledge / task / skill / message since a prior
 * cursor, optionally blocking up to `wait` seconds if nothing has
 * landed yet.
 *
 * Agents polling for peer activity should call this instead of
 * sleeping + re-listing individual resources — one call covers
 * every type and wakes the moment something applies.
 */
export function registerChangesTools(server: McpServer, pact: OpenPact): void {
  registerTool(
    server,
    'wait_for_changes',
    {
      description:
        'Cross-type change feed for tailing. The feed is CHRONOLOGICAL (oldest-first); a call with no `since` replays history, not the latest entry. To skip the replay and tail only new activity, call with `from="head"` first to get a cursor pinned to the current head, then loop `?since=<that>&wait=30`. Not a discovery primitive — to FIND existing tasks/messages/knowledge use list_tasks / read_messages / recall_knowledge with filters instead.',
      inputSchema: {
        since: z
          .string()
          .optional()
          .describe(
            'Cursor from a prior response (format `<timestamp>|<id>`). Omit for full replay.',
          ),
        wait: z
          .number()
          .int()
          .min(0)
          .max(30)
          .optional()
          .describe(
            'Seconds to block if no new entries past `since`. Default 0 (immediate return).',
          ),
        type: z
          .enum(['knowledge', 'task', 'skill', 'message'])
          .optional()
          .describe('Restrict the feed to one entry type.'),
        limit: z.number().int().min(1).max(1000).optional(),
        from: z
          .enum(['head'])
          .optional()
          .describe(
            'Set to "head" to skip history entirely and return a cursor pinned to the current head. Use this once as the seed for a tail loop.',
          ),
      },
    },
    async (opts) => safeHandler(async () => jsonContent(await pact.changes.poll(opts))),
  )
}
