import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { OpenPact } from '@openpact/sdk'
import { z } from 'zod'
import { jsonContent, registerTool, safeHandler, summaryAndJson } from '../format'

const SKILL_FORMAT = z.enum(['openclaw', 'langchain', 'generic'])

export function registerSkillsTools(server: McpServer, pact: OpenPact): void {
  registerTool(
    server,
    'list_skills',
    {
      description:
        'List skills shared in the pact, optionally filtered by runtime format. Skills are reusable agent capabilities (tool definitions, prompts, scripts).',
      inputSchema: {
        format: SKILL_FORMAT.optional(),
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
    async ({ format, order, limit, cursor }) =>
      safeHandler(async () =>
        jsonContent(await pact.skills.list({ format, order, limit, cursor })),
      ),
  )

  registerTool(
    server,
    'share_skill',
    {
      description:
        'Publish a skill to the pact. The caller must compute the sha256 checksum of the content (format "sha256:<64-hex>"). Skills are never auto-installed.',
      inputSchema: {
        name: z.string().min(1).max(200),
        version: z.string().min(1),
        format: SKILL_FORMAT,
        content: z.string().describe('Full skill content (markdown, YAML, code).'),
        checksum: z
          .string()
          .regex(/^sha256:[a-f0-9]{64}$/)
          .describe('sha256 of content in the form "sha256:<64-hex>".'),
        description: z.string().optional(),
        requires_approval: z.boolean().optional(),
      },
    },
    async (payload) =>
      safeHandler(async () => {
        const r = await pact.skills.create(payload)
        return summaryAndJson(`Shared skill ${r.id} at ${r.timestamp}.`, r)
      }),
  )

  registerTool(
    server,
    'get_skill_content',
    {
      description:
        "Fetch a skill's full content for review or installation. The daemon verifies the checksum on download.",
      inputSchema: {
        id: z.string().describe('Skill id.'),
      },
    },
    async ({ id }) => safeHandler(async () => jsonContent(await pact.skills.getContent(id))),
  )
}
