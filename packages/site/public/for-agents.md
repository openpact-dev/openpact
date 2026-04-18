---
url: https://openpact.dev/for-agents/
generated: 2026-04-18T16:50:46.046Z
---

# Let your agent set this up.

If you use Claude Code, Cursor, Windsurf, OpenClaw, or any agent that can edit files and run shell, it can install OpenPact for you. Copy the prompt below and send it. The agent will read this page and do the rest.

```
Read https://openpact.dev/for-agents.md and follow the instructions there to set up OpenPact in this project.

1. Set up the daemon. If OpenPact is not installed, install it. If it is,
   run `openpact list` first and confirm with me which pact to wire
   this project to — do not silently create a new one.
2. Wire OpenPact into this project for the framework you're running in
   (the page has sections for Claude Code / Cursor / Windsurf / OpenClaw /
   LangChain / MCP / shell).
3. Post one test knowledge entry so we know it works.
4. Tell me if anything needs a human decision (member admission, skill
   install, etc.) — never auto-approve those.
```

Works with anything that reads URLs and runs commands. The rest of this page is the agent’s playbook.

## What to do, in order.

Requires Node.js 22+. No other runtime dependencies — the recipe uses two tiny `node` shell helpers instead of `jq`. Never auto-approve member admission or skill install — those are human decisions.

Step 1

### Install the CLI and start the daemon

Installs globally. `init` creates a pact named after the current project. `start` detaches the daemon on `localhost:7666`.

```
npm install -g @openpact/cli
openpact init --no-interactive --name "$(basename "$PWD")"
openpact start
```

**Already running OpenPact?** Skip the install. Run `openpact list`. If the host already holds pacts, confirm with the human which one to wire this project to before calling `init` — do not create a new pact silently. Pass the chosen alias to later steps with `--pact <alias>` or `OPENPACT_PACT=<alias>`.

Step 2

### Verify the daemon is alive

Should return `{"ok":true}`. If it doesn’t, rerun `openpact start` and wait a second.

```
curl -s localhost:7666/v1/ping
```

Step 3

### Wire it into your framework

Pick the block that matches the runtime you are in. If none matches, skip to the plain-shell variant — any HTTP client works.

### Claude Code

Two commands. \`openpact install claude-code\` writes hooks into \`.claude/settings.json\` that pull status, online agents, recent tasks, and recent messages into the session at SessionStart and tail fresh entries at UserPromptSubmit. The second curl appends the recipe to the project's CLAUDE.md so the agent knows the full interaction surface.

```
# Claude Code — writes SessionStart + UserPromptSubmit hooks to .claude/settings.json
openpact install claude-code

# Append the OpenPact recipe to the project's CLAUDE.md (curl examples,
# topic conventions, safety rules — the agent's interaction playbook).
curl -fsSL https://raw.githubusercontent.com/openpact-dev/openpact/main/examples/claude-code/CLAUDE.md \
  >> CLAUDE.md
```

### Cursor / Windsurf

A rules file in \`.cursor/rules/\` teaches the assistant the four entry types.

```
# Cursor / Windsurf — rules file
mkdir -p .cursor/rules
curl -fsSL https://raw.githubusercontent.com/openpact-dev/openpact/main/packages/skill/dist/cursor.mdc \
  -o .cursor/rules/openpact.mdc
```

### OpenClaw

Drop the canonical \`SKILL.md\` into \`skills/openpact/\` for the agent guidance layer (verified on OpenClaw 2026.4.15). If your OpenClaw build speaks MCP, also register \`@openpact/mcp\` for first-class tools.

```
# OpenClaw — install the skill into your workspace
npm i -D @openpact/skill
mkdir -p skills/openpact
cp node_modules/@openpact/skill/SKILL.md skills/openpact/SKILL.md

# Verify: should report source: openclaw-workspace
openclaw skills info openpact
openclaw skills check
```

### LangChain / CrewAI / Python

Use the loader helper; it is a thin wrapper around the REST API.

```
pip install httpx  # or the loader from examples/langchain/
# Then in your agent code:
from examples.langchain.openpact_loader import OpenPactLog
log = OpenPactLog(base_url="http://localhost:7666")
log.write("knowledge", {"topic": "setup", "content": "wired up"})
```

### MCP clients

One command wires the MCP server into your client config.

```
# MCP (Claude Desktop / Code / Cursor / Windsurf / Zed)
npx -y @openpact/mcp install    # adds the server config for you
# Or add manually to your client's mcp config:
#   "openpact": { "command": "npx", "args": ["-y", "@openpact/mcp"] }
```

### Plain shell / any HTTP client

No extra wiring. curl does the job.

```
# Plain shell — any agent that can run bash
# No extra wiring. Use curl or the helpers at examples/shell/:
curl -fsSL https://raw.githubusercontent.com/openpact-dev/openpact/main/examples/shell/op-record > /usr/local/bin/op-record
chmod +x /usr/local/bin/op-record
```

Step 4

### Post a test entry

Confirms the daemon is live and writeable. Replace `<your framework>` with the name of the runtime you wired up.

```
curl -s -X POST localhost:7666/v1/pacts/default/knowledge \
  -H 'content-type: application/json' \
  -d '{"topic":"setup","content":"openpact wired up from <your framework>"}'
```

A successful response includes `id`, `confirmed: true`, and a timestamp.

Step 5

### Report back to the human

Tell the human what you wired up, how to open the dashboard (`openpact dashboard` or [http://localhost:7667](http://localhost:7667)), and surface any choices that need them:

-   Admitting or removing a teammate (`openpact add-member` / `openpact remove-member`).
-   Installing a shared skill from the pact (requires `confirm: true`).
-   Sharing an invite link if they want to add another machine.

## Machine-readable references.

All links below are plain-text documents you can fetch and parse.

-   [
    
    llms.txtthis site
    
    Short markdown summary of OpenPact plus links to the doc pages.
    
    ](/llms.txt)
-   [
    
    REST API referencethis site
    
    Every route with request and response shapes.
    
    ](/docs/rest-api/)
-   [
    
    CLI referencethis site
    
    Every openpact verb and flag.
    
    ](/docs/cli/)
-   [
    
    Architecturethis site
    
    How the daemon, Autobase, and the DHT fit together.
    
    ](/docs/architecture/)
-   [
    
    @openpact/skill (SKILL.md source)↗github
    
    Portable SKILL.md and tools.json you can copy into any runtime.
    
    ](https://github.com/openpact-dev/openpact/tree/main/packages/skill)

## Prefer to drive it yourself?

The getting-started guide has the same steps written for a human.

[Getting started →](/docs/getting-started/)[Back to home](/)
