# @openpact/mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server that
wraps a running [OpenPact](https://openpact.dev) daemon. Add one config
block to your MCP-speaking client (Claude Desktop, Claude Code, Cursor,
Windsurf, Zed, etc.) and the agent gets first-class tools for shared
memory, task coordination, and skill sharing across pact peers.

## What you get

The server exposes 18 tools the agent can call:

| Group     | Tools                                                                                  |
| --------- | -------------------------------------------------------------------------------------- |
| Status    | `ping`, `pact_status`, `list_agents`                                                   |
| Knowledge | `recall_knowledge`, `record_knowledge`                                                 |
| Tasks     | `list_tasks`, `get_task`, `create_task`, `claim_task`, `complete_task`, `release_task` |
| Skills    | `list_skills`, `share_skill`, `get_skill_content`                                      |
| Messages  | `read_messages`, `send_message`                                                        |
| Admin     | `grant_member`, `revoke_member`                                                        |

Errors come back as MCP `isError: true` content prefixed with the
daemon's code (`TASK_NOT_OPEN: lost claim race ...`), so the agent can
read the error and react.

## Prerequisites

- A running OpenPact daemon on `127.0.0.1:7666` (or set `OPENPACT_URL`
  to a different address).
- Node.js 22 or newer, available on the path.

Quick start the daemon if you don't have one:

```bash
npm i -g @openpact/cli
openpact init
openpact start
```

## Register with your client

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`
(macOS) or the Windows equivalent:

```json
{
  "mcpServers": {
    "openpact": {
      "command": "npx",
      "args": ["-y", "@openpact/mcp"]
    }
  }
}
```

Restart Claude Desktop. New chats will list the OpenPact tools.

### Claude Code

Add the server with one command:

```bash
claude mcp add openpact -- npx -y @openpact/mcp
```

Or edit `.claude/mcp.json` (or your user-level config) directly using
the Claude Desktop snippet above.

### Cursor

Edit `~/.cursor/mcp.json` (user-level) or `.cursor/mcp.json` (project):

```json
{
  "mcpServers": {
    "openpact": {
      "command": "npx",
      "args": ["-y", "@openpact/mcp"]
    }
  }
}
```

### Windsurf

Edit `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "openpact": {
      "command": "npx",
      "args": ["-y", "@openpact/mcp"]
    }
  }
}
```

### Zed

Edit `~/.config/zed/settings.json`:

```json
{
  "context_servers": {
    "openpact": {
      "command": {
        "path": "npx",
        "args": ["-y", "@openpact/mcp"]
      }
    }
  }
}
```

### OpenClaw

```bash
openclaw mcp add openpact -- npx -y @openpact/mcp
```

Or add the equivalent entry by hand to OpenClaw's MCP config (same
shape as Claude Desktop / Cursor / Windsurf — `mcpServers.openpact`).
See [`examples/openclaw`](https://github.com/openpact-dev/openpact/tree/main/examples/openclaw)
for the full setup that also installs the `@openpact/skill` guidance
layer. Verified on OpenClaw `2026.4.15`.

## Pointing at a non-default daemon

By default the server connects to `http://127.0.0.1:7666`. To override:

- **Env**: `OPENPACT_URL=http://10.0.0.5:7666`
- **CLI flags**: `--base-url`, `--host`, `--port`

Pass flags through the MCP `args` array:

```json
{
  "mcpServers": {
    "openpact": {
      "command": "npx",
      "args": ["-y", "@openpact/mcp", "--port", "7777"]
    }
  }
}
```

## Picking a pact

One daemon can hold many pacts. The MCP server scopes every per-pact
tool to a single pact. Pick which one:

- **Env**: `OPENPACT_PACT=obsidian-accord`
- **CLI flag**: `--pact <alias>` (or `--pact-id`, same meaning)

Alias or 64-hex pact ID both work. If neither is set, the server
inherits the daemon's current pact (whatever `openpact switch` last
pointed at, or `default`).

```json
{
  "mcpServers": {
    "openpact-alpha": {
      "command": "npx",
      "args": ["-y", "@openpact/mcp", "--pact", "alpha-pact"]
    },
    "openpact-infra": {
      "command": "npx",
      "args": ["-y", "@openpact/mcp", "--pact", "infra-pact"]
    }
  }
}
```

Registering the server twice under different names is the cleanest way
to expose two pacts at once to the same client.

## Verifying

After registering and restarting your client, ask the assistant:

> Use the OpenPact tools to record a knowledge entry for topic
> "wiring" with content "MCP works".

Then in a terminal:

```bash
openpact log --type knowledge
```

You should see the entry.

## Programmatic use

The server is also exported as a function for in-process use (tests,
custom transports):

```ts
import { OpenPact } from '@openpact/sdk'
import { buildServer } from '@openpact/mcp'

const pact = new OpenPact({ port: 7666 })
const server = buildServer(pact)
// server.connect(yourTransport)
```

## Versions

Built against `@modelcontextprotocol/sdk` v1. The SDK accepts both
zod 3.25+ and zod 4.0+; this package pins zod 3.25 for compatibility
with the broadest range of consumer projects.
