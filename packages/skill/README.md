# @openpact/skill

A portable agent skill for the OpenPact daemon. Two files:

- **`SKILL.md`** — markdown + YAML frontmatter that any LLM-driven
  runtime (OpenClaw, Cursor rules, Windsurf rules, Claude Code,
  bespoke agents) can load as a system-prompt addition.
- **`tools.json`** — the same tool surface in a machine-readable form
  for runtimes that codegen tools (LangChain, CrewAI, AutoGen,
  custom).

If your runtime speaks **MCP** (Claude Desktop, Claude Code, Cursor,
Windsurf, Zed), use [`@openpact/mcp`](https://www.npmjs.com/package/@openpact/mcp)
instead — MCP gives the agent first-class tools without prompt-level
glue.

## What it gives the agent

- **Recall before acting.** Read recent knowledge before answering or
  proposing a change.
- **Record after deciding.** Capture non-obvious calls so the next
  session starts from that ground.
- **Coordinate work.** Post tasks, claim them, complete them — without
  multiple agents stepping on each other.
- **Broadcast updates.** Short messages so other agents see what's in
  flight.

## Prerequisites

- A running OpenPact daemon on `127.0.0.1:7666`. Quick start:

  ```bash
  npm i -g @openpact/cli
  openpact init
  openpact start
  ```

- The agent runtime must be able to issue HTTP requests (or use a
  shell tool that can call `curl`).

## Install per runtime

### OpenClaw

OpenClaw supports MCP, so register `@openpact/mcp` for first-class
OpenPact tools and install this `SKILL.md` alongside as the agent's
guidance layer. See [`examples/openclaw`](https://github.com/openpact-dev/openpact/tree/main/examples/openclaw)
for the full layout.

```bash
# Tool layer: wire up the MCP server
openclaw mcp add openpact -- npx -y @openpact/mcp

# Guidance layer: drop the SKILL into the workspace
npm i -D @openpact/skill
mkdir -p skills/openpact
cp node_modules/@openpact/skill/SKILL.md skills/openpact/SKILL.md

# Verify
openclaw skills info openpact
openclaw skills check
```

Verified on OpenClaw `2026.4.15`. The markdown body loads as skill
instructions; the MCP server owns the tool surface. The frontmatter
`tools:` block is not consumed as runtime tools on current OpenClaw —
that's by design, since MCP is the right integration point.

### Cursor

Drop `SKILL.md` into `.cursor/rules/openpact.md`:

```bash
mkdir -p .cursor/rules
cp node_modules/@openpact/skill/SKILL.md .cursor/rules/openpact.md
```

The frontmatter is ignored as plain text — Cursor reads the markdown
body. The agent gets the conventions; you write a small wrapper to
execute the curl recipes (or use the [Claude Code recipe](https://github.com/openpact-dev/openpact/blob/main/examples/claude-code/CLAUDE.md)
for inspiration).

### Windsurf

Drop `SKILL.md` into `.windsurf/rules/openpact.md` (same shape as
Cursor).

### Claude Code

Use the [paste-into-CLAUDE.md recipe](https://github.com/openpact-dev/openpact/blob/main/examples/claude-code/CLAUDE.md)
in the OpenPact repo — it's the Claude Code-flavored version of this
same skill, with curl + jq one-liners spelled out. Or install
`@openpact/mcp` for first-class tools.

### LangChain (Python)

Load `tools.json` and codegen the tools at boot:

```python
import json, requests
from pathlib import Path
from langchain.tools import StructuredTool
import os

spec = json.loads(Path("node_modules/@openpact/skill/tools.json").read_text())
base = os.environ.get(spec["runtime"]["env"], spec["runtime"]["base_url"])

def make_tool(t):
    def call(**kwargs):
        path = t["path"]
        for k in t.get("params", {}):
            path = path.replace(f":{k}", str(kwargs.pop(k)))
        url = base + path
        method = t["method"]
        if method == "GET":
            return requests.get(url, params=kwargs).json()
        return requests.request(method, url, json=kwargs).json()
    return StructuredTool.from_function(call, name=t["name"], description=t["description"])

tools = [make_tool(t) for t in spec["tools"]]
```

(Sketch — adapt argument schemas to your LangChain version. The
canonical tool surface is in `tools.json`; keep your loader in lock
step with it.)

### Custom agent runtime

Read `tools.json`. For each tool, build the URL from
`base_url + path` (substituting `:id`-style params), use `query` for
query-string params on GETs, and use `body` as the JSON request body
for non-GETs. Surface daemon errors (`{ error: "<CODE>", ... }`) to
the agent verbatim — codes are documented in `errors.codes`.

## Verify

After installing, ask the agent (in whatever way your runtime accepts
prompts):

> Use OpenPact: list any recent knowledge, then record that we're
> starting an experiment called "skill wiring works".

Then in a terminal:

```bash
openpact log --type knowledge
```

You should see the new entry.

## Versioning

`SKILL.md` and `tools.json` are kept in lock step. The version field
in both reflects the daemon REST surface they target (which itself
follows `@openpact/daemon`'s major). When the daemon's REST surface
changes incompatibly, this package's major bumps too.
