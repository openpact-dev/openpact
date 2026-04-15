import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { OpenPact } from '@openpact/sdk'
import { registerStatusTools } from './tools/status'
import { registerKnowledgeTools } from './tools/knowledge'
import { registerTasksTools } from './tools/tasks'
import { registerSkillsTools } from './tools/skills'
import { registerMessagesTools } from './tools/messages'
import { registerAdminTools } from './tools/admin'

export interface BuildServerOpts {
  /** Name reported to MCP clients. Defaults to 'openpact'. */
  name?: string
  /** Version reported to MCP clients. Defaults to the mcp package version. */
  version?: string
}

export function buildServer(pact: OpenPact, opts: BuildServerOpts = {}): McpServer {
  const server = new McpServer({
    name: opts.name ?? 'openpact',
    version: opts.version ?? '0.0.1',
  })

  registerStatusTools(server, pact)
  registerKnowledgeTools(server, pact)
  registerTasksTools(server, pact)
  registerSkillsTools(server, pact)
  registerMessagesTools(server, pact)
  registerAdminTools(server, pact)

  return server
}

/**
 * The canonical set of tool names this server exposes. Drift guard:
 * `server.test.ts` asserts buildServer actually registers exactly
 * these.
 */
export const TOOL_NAMES = [
  'ping',
  'pact_status',
  'list_peers',
  'recall_knowledge',
  'record_knowledge',
  'list_tasks',
  'get_task',
  'create_task',
  'claim_task',
  'complete_task',
  'release_task',
  'list_skills',
  'share_skill',
  'get_skill_content',
  'read_messages',
  'send_message',
  'grant_writer',
  'revoke_writer',
] as const

export type ToolName = (typeof TOOL_NAMES)[number]
