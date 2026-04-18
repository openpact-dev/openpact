import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { OpenPact } from '@openpact/sdk'
import { z } from 'zod'
import { errorContent, jsonContent, registerTool, safeHandler, summaryAndJson } from '../format'

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

  registerTool(
    server,
    'list_pacts',
    {
      description:
        'List every pact on this host (alias, pact_id, role, is_current). Host-level — works without a pactId. Pair with `switch_pact` to retarget the server at a different pact.',
      inputSchema: {},
    },
    async () => safeHandler(async () => jsonContent(await pact.pacts.list())),
  )

  registerTool(
    server,
    'switch_pact',
    {
      description:
        "Retarget this MCP server at a different pact for the rest of the session. Pass the local alias (e.g. 'qr-testing') or the 64-hex pact_id. Changes only this server's in-memory scope; the daemon's own currentAlias (what the `openpact` CLI uses) is not touched. Call `list_pacts` first to see what is available.",
      inputSchema: {
        pactId: z
          .string()
          .min(1)
          .describe('Local alias or 64-hex pact_id to target. Must exist on this host.'),
      },
    },
    async ({ pactId }) =>
      safeHandler(async () => {
        const { pacts } = await pact.pacts.list()
        const match = pacts.find((p) => p.alias === pactId || p.pact_id === pactId)
        if (!match) {
          return errorContent(
            new Error(
              `NO_SUCH_PACT: ${pactId} is not one of this host's pacts; call list_pacts to see available aliases`,
            ),
          )
        }
        pact.setPactId(match.alias)
        return summaryAndJson(`switched to ${match.alias}`, {
          alias: match.alias,
          pact_id: match.pact_id,
          pact_name: match.pact_name,
          role: match.role,
        })
      }),
  )
}
