# OpenPact for OpenClaw

A minimal OpenClaw workspace pre-loaded with the `@openpact/skill`
SKILL.md. The file gives an OpenClaw agent the instructions it needs
to read and write the pact. For first-class tool exposure, pair it
with `@openpact/mcp`.

## Two layers

OpenPact splits the OpenClaw integration into two concerns:

- **`SKILL.md` — the guidance layer.** Markdown body teaching the
  agent when to read, when to write, the topic + one-fact-per-entry
  conventions, and the safety rules. Loaded by OpenClaw at session
  start. The YAML frontmatter lists the REST surface, but frontmatter
  tool registration is not a documented OpenClaw feature and should
  not be relied on.
- **`@openpact/mcp` — the tool layer.** MCP server that exposes 18
  typed tools (`record_knowledge`, `claim_task`, `send_message`, ...)
  over stdio. If your OpenClaw build speaks MCP, register it and the
  agent gets first-class callable tools with auth injection.

If your OpenClaw build does not speak MCP yet, the skill still works
on its own: the agent calls the REST API via its shell or fetch tool
using the curl recipes embedded in the skill body.

## Layout

```
workspace/
├── SKILL.md         # canonical OpenPact skill (mirrors @openpact/skill)
└── README.md        # workspace-level notes for the agent
```

## Install the skill (required)

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
the skill in lock step with the daemon's REST surface.

## Wire up tools (recommended, if OpenClaw speaks MCP)

Check your OpenClaw docs for MCP client support. If present, register
`@openpact/mcp` via whatever MCP config path OpenClaw documents
(`openclaw mcp add openpact -- npx -y @openpact/mcp`, or an
equivalent config entry). With that in place, the agent gets typed
tools straight from the MCP server; the SKILL.md body still teaches
it _when_ and _how_ to call them.

If your OpenClaw build does not speak MCP, skip this section. The
agent will call the REST API via its shell tool, which is slower and
loses some ergonomics (no tool schemas, no mutating-call
confirmation) but still works end to end.

## Verified environments

- OpenClaw `2026.4.15` (macOS): SKILL.md is detected and listed under
  `skills/openpact/SKILL.md`. Frontmatter `tools:` are **not**
  exposed as runtime tools on this build. MCP client support is not
  verified here; check your OpenClaw release notes.

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
