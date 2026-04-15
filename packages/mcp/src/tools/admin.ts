import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { OpenPact } from '@openpact/sdk'
import { z } from 'zod'
import { registerTool, safeHandler, summaryAndJson } from '../format'

const HEX64 = z.string().regex(/^[0-9a-f]{64}$/)

export function registerAdminTools(server: McpServer, pact: OpenPact): void {
  registerTool(
    server,
    'grant_writer',
    {
      description:
        'Bind a peer (by 64-hex public key) as a writer or indexer of this pact. Only an existing indexer can call this; otherwise the entry is silently ignored by the apply layer.',
      inputSchema: {
        key: HEX64.describe('Peer public key as 64 lowercase hex chars.'),
        indexer: z
          .boolean()
          .optional()
          .describe('If true, also grant indexer status (can confirm the frontier).'),
      },
    },
    async ({ key, indexer }) =>
      safeHandler(async () => {
        const r = await pact.admin.addWriter(key, { indexer })
        return summaryAndJson(`Granted ${indexer ? 'indexer' : 'writer'} role to ${key}.`, r)
      }),
  )

  registerTool(
    server,
    'revoke_writer',
    {
      description:
        'Remove a writer from this pact. Same indexer-only permission rule as grant_writer.',
      inputSchema: {
        key: HEX64.describe('Peer public key as 64 lowercase hex chars.'),
      },
    },
    async ({ key }) =>
      safeHandler(async () => {
        const r = await pact.admin.removeWriter(key)
        return summaryAndJson(`Removed writer ${key}.`, r)
      }),
  )
}
