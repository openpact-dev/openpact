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
        'Cross-type change feed with optional long-poll. Returns entries that landed on the pact since the given `since` cursor, in chronological order. Pass `wait` (seconds, 0-30) to block until new entries arrive or the window elapses. Use for event-driven agent coordination instead of polling individual list endpoints. First call with no `since` seeds the cursor; subsequent calls loop with the returned cursor + a wait to tail forever. Optionally filter by `type`.',
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
      },
    },
    async (opts) => safeHandler(async () => jsonContent(await pact.changes.poll(opts))),
  )
}
