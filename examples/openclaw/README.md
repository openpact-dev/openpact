# OpenPact for OpenClaw

A minimal OpenClaw workspace pre-loaded with the `@openpact/skill`
SKILL.md and wired up to `@openpact/mcp` for typed tool calls.
OpenClaw supports MCP, so the recommended setup is both layers
together.

## Two layers

OpenPact splits the OpenClaw integration into two concerns:

- **`@openpact/mcp` — the tool layer.** MCP server that exposes 19
  typed tools (`record_knowledge`, `claim_task`, `send_message`,
  `list_pacts`, `switch_pact`, ...) over stdio. Register it and
  OpenClaw gets first-class callable tools with bearer-token auth
  injection and mutating-call confirmation.
- **`SKILL.md` — the guidance layer.** Markdown body teaching the
  agent when to read, when to write, the topic + one-fact-per-entry
  conventions, and the safety rules. Loaded by OpenClaw at session
  start. It does not need to carry the tool surface (the MCP server
  owns that); it carries the playbook.

Both are recommended. Tools without the playbook means an agent that
can call endpoints but doesn't know when. The playbook without tools
means an agent that knows the rules but can only reach the daemon
via its shell tool.

## Layout

```
workspace/
├── SKILL.md         # canonical OpenPact skill (mirrors @openpact/skill)
└── README.md        # workspace-level notes for the agent
```

## Register the MCP server (recommended first step)

OpenClaw speaks MCP. Point it at `@openpact/mcp`:

```bash
openclaw mcp add openpact -- npx -y @openpact/mcp
```

Or add the equivalent entry to OpenClaw's MCP config by hand:

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

See OpenClaw's MCP docs for the exact config file path on your build.

Restart OpenClaw. New sessions will list the OpenPact tools
(`ping`, `pact_status`, `list_pacts`, `recall_knowledge`,
`record_knowledge`, task lifecycle, messages, skills, ...).
The server auto-discovers the daemon's current pact at startup, so
there's no per-session config.

## Install the skill

From your project root:

```bash
npm i -D @openpact/skill
mkdir -p skills/openpact
cp node_modules/@openpact/skill/SKILL.md skills/openpact/SKILL.md
```

OpenClaw picks up the skill at the next session start. Verify:

```bash
openclaw skills info openpact   # should report source: openclaw-workspace
openclaw skills check           # openpact should appear as eligible
```

Re-run the copy step after each `@openpact/skill` upgrade to keep
the playbook in lock step with the daemon's tool surface.

## Verified environments

- OpenClaw `2026.4.15` (macOS): MCP integration works end to end.
  SKILL.md is detected and listed under
  `skills/openpact/SKILL.md`. Frontmatter `tools:` are not consumed
  as runtime tools on this build, which is fine — the MCP server
  owns the tool surface.

## Prerequisites

- A running OpenPact daemon on `127.0.0.1:7666`. Quick start:

  ```bash
  npm i -g @openpact/cli
  openpact init
  openpact start
  ```

- An OpenClaw agent runtime (not bundled here — see the OpenClaw
  docs for setup).

## Smoke test

`test/smoke.test.ts` boots a tmp daemon on an ephemeral port and
walks every tool defined in the workspace's `SKILL.md`, asserting
each tool's documented `method + path` works against a live daemon.
This catches drift between the skill file and the daemon's REST
surface — without needing a real OpenClaw runtime in CI.

Manual smoke (a real OpenClaw session reading + writing the pact)
is the agent-level integration check, recorded as a checkbox in the
PR template.

```bash
npm run -w examples-openclaw test
```
