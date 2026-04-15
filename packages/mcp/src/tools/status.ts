import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { OpenPact } from '@openpact/sdk'
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
        'Report this pact: pact_id, this peer handle, role, entry count, peer count, and whether we are a writer or indexer. Use this to orient at session start.',
      inputSchema: {},
    },
    async () => safeHandler(async () => jsonContent(await pact.status())),
  )

  registerTool(
    server,
    'list_peers',
    {
      description:
        'List peers currently connected to the pact. Returns an array of {id, remote_key, online}. Useful before sending a direct message to confirm the peer handle.',
      inputSchema: {},
    },
    async () => safeHandler(async () => jsonContent(await pact.peers())),
  )
}
