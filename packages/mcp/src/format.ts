import { OpenPactError } from '@openpact/sdk'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export interface TextContent {
  type: 'text'
  text: string
}

/**
 * MCP `tools/call` result shape. The SDK's CallToolResult comes from a
 * Zod loose object, so it carries an index signature for unknown extra
 * fields — we reflect that here so `Promise<ToolResult>` is assignable
 * to the SDK's tool-callback return type without ceremony.
 */
export interface ToolResult {
  content: TextContent[]
  isError?: boolean
  [key: string]: unknown
}

/** Wraps a JSON-stringifiable value in an MCP text-content tool result. */
export function jsonContent(value: unknown): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  }
}

/**
 * Summary + JSON body — the shape we want for mutating tools so the
 * model has a one-line signal before parsing the payload.
 */
export function summaryAndJson(summary: string, value: unknown): ToolResult {
  return {
    content: [
      {
        type: 'text',
        text: `${summary}\n\n${JSON.stringify(value, null, 2)}`,
      },
    ],
  }
}

/**
 * Turns any thrown error into an isError tool result. SDK errors keep
 * their code prefix (e.g. `TASK_NOT_OPEN: lost claim race ...`); other
 * errors are surfaced as-is. Agents read this text to decide what to do.
 */
export function errorContent(err: unknown): ToolResult {
  if (err instanceof OpenPactError) {
    return {
      isError: true,
      content: [{ type: 'text', text: `${err.code}: ${err.message}` }],
    }
  }
  const message = err instanceof Error ? err.message : String(err)
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
  }
}

/** Runs a tool body and maps any thrown error into errorContent. */
export async function safeHandler(fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn()
  } catch (err) {
    return errorContent(err)
  }
}

/**
 * Thin wrapper around server.registerTool that erases the SDK's deep
 * generic on inputSchema. Without this, every registerTool call site
 * triggers TS2589 (excessively deep instantiation) because the SDK
 * resolves a structural ZodRawShapeCompat against our zod schemas at
 * each call. Schemas are still validated at runtime by the SDK; we
 * cover each tool's arg shape with unit tests.
 */
export interface ToolConfig {
  description: string
  inputSchema: Record<string, unknown>
}

export type ToolHandler = (args: any) => Promise<ToolResult>

export function registerTool(
  server: McpServer,
  name: string,
  config: ToolConfig,
  handler: ToolHandler,
): void {
  ;(server as any).registerTool(name, config, handler)
}
