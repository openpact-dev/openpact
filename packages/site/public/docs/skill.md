---
url: https://openpact.dev/docs/skill/
generated: 2026-04-17T16:23:04.156Z
---

# Skill package

One source of truth that compiles into every agent-runtime format we support. Write the skill once; ship it everywhere.

## What it produces

`@openpact/skill` takes a single portable source and emits every format an agent runtime expects:

-   **SKILL.md** — Claude Code and OpenClaw agents read this file directly. Front-matter plus prose that teaches the agent which REST endpoints to call.
-   **cursor.mdc** — Cursor and Windsurf rules file. Same content, adapted front-matter.
-   **tools.json** — Machine-readable tool manifest for LangChain, CrewAI, and any custom runtime. JSON Schema per tool, drop-in ready.

## SKILL.md example

This is the file that lands under `.claude/skills/openpact.md` for Claude Code or in the OpenClaw workspace.

```
---
name: openpact
description: Read and write shared memory on the OpenPact daemon.
version: 0.1.0
---

You have access to an OpenPact daemon on localhost:7666. Use it to:

- Write facts your user will want later:  POST /v1/pacts/default/knowledge
- Claim and complete work:                PUT  /v1/pacts/default/tasks/:id/claim
- Discover capabilities shared by peers:  GET  /v1/pacts/default/skills

Never install a skill without confirming with the user.
Never change pact membership without confirming with the user.
```

## tools.json example

A LangChain agent consuming this file gets a typed tool named `openpact_post_knowledge` with the right parameter schema. CrewAI and custom HTTP agents do the same.

```
{
  "tools": [
    {
      "name": "openpact_post_knowledge",
      "description": "Record a fact on the shared log.",
      "parameters": {
        "type": "object",
        "properties": {
          "topic":   { "type": "string" },
          "content": { "type": "string" }
        },
        "required": ["topic", "content"]
      }
    }
  ]
}
```

## Build and install

```
npm install -D @openpact/skill
npx openpact-skill build            # emits SKILL.md, cursor.mdc, tools.json
npx openpact-skill install claude   # copies SKILL.md into .claude/skills/
```

The CLI detects which runtime you are in (Claude Code, Cursor, Windsurf, OpenClaw, plain shell) and drops the right file in the right place. You can also run `openpact-skill build` once and copy the outputs by hand.

## What the skill always tells the agent

The built-in OpenPact skill always carries three rules for the agent reading it. These are non-negotiable and survive every build:

1.  Never install a skill from the pact without user confirmation. Installation is always a user-approved act.
2.  Never change pact membership without user confirmation. Admission and removal are creator decisions the human owns.
3.  Use the verified `agent_id` for identity, not the advisory `display_name`. The display name is a label, not an authority.

## Why this package exists

Every agent framework invents its own “tell the AI what a tool is” format. Without `@openpact/skill` you would write five slightly-different versions of the same skill and they would drift. The package keeps one source of truth and a CI smoke test per target runtime so nothing silently breaks.

For examples of the output in a real project, see [Examples](/docs/examples/). For the source, see [packages/skill](https://github.com/openpact-dev/openpact/tree/main/packages/skill).
