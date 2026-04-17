import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { OpenPact } from '@openpact/sdk'
import { z } from 'zod'
import { jsonContent, registerTool, safeHandler } from '../format'

export function registerStatusTools(server: McpServer, pact: OpenPact): void {
  registerTool(
    server,
    'ping',
    {
      description:
        'Check that the OpenPact daemon is reachable. Returns {ok: true} when healthy. Use this first if other tools fail.',
      inputSchema: {},
    },
    async () => safeHandler(async () => jsonContent(await pact.ping())),
  )

  registerTool(
    server,
    'pact_status',
    {
      description:
        'Report this pact: pact_id, this peer handle, role, entry count, agent count, and whether we are a member or indexer. Use this to orient at session start.',
      inputSchema: {},
    },
    async () => safeHandler(async () => jsonContent(await pact.status())),
  )

  registerTool(
    server,
    'list_agents',
    {
      description:
        'List agents in this pact. Each row is {id, remote_key, role, display_name, online, is_self}. Pass online=true to restrict to live peers — handy as a cheap precheck before posting a claimable task or an assigned_to task.',
      inputSchema: {
        online: z
          .boolean()
          .optional()
          .describe(
            'Liveness filter. true → only authenticated peers on this host. false → only offline members. Omit for everyone.',
          ),
      },
    },
    async ({ online }) => safeHandler(async () => jsonContent(await pact.agents({ online }))),
  )
}
