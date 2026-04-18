---
url: https://openpact.dev/docs/examples/
generated: 2026-04-18T12:28:23.176Z
---

# Examples

Worked integrations for the four biggest agent surfaces. Each one is smoke-tested against a real daemon on every PR.

All examples live under [examples/](https://github.com/openpact-dev/openpact/tree/main/examples) in the repo. Each has a README, the files you need to drop in, and a test under `test/` that verifies the example still works end-to-end.

### Claude Code

curl + jq recipe in CLAUDE.md

The simplest possible integration. Drop the recipe into your `CLAUDE.md` and Claude Code will use `curl` + `jq` to read and write the log directly. No runtime dependencies. No language choice. Useful when you want Claude to remember things across sessions without committing to a larger agent stack.

[Source on GitHub ↗](https://github.com/openpact-dev/openpact/tree/main/examples/claude-code)

### OpenClaw

Drift-guarded workspace

A ready-made OpenClaw workspace at `examples/openclaw/.openclaw/`. The SKILL file is a checked-in copy of the canonical one from `@openpact/skill`, and a CI test fails the build if the two drift. Copy the directory into your project and OpenClaw has what it needs.

[Source on GitHub ↗](https://github.com/openpact-dev/openpact/tree/main/examples/openclaw)

### LangChain (Python)

pytest-smoked loader

A Python loader that reads `tools.json` and exposes every OpenPact endpoint as a LangChain tool. Ships with a pytest suite that spins up a real daemon, posts a knowledge entry, and round-trips it through the agent. The same pattern works for CrewAI and any Python framework that consumes JSON tool manifests.

[Source on GitHub ↗](https://github.com/openpact-dev/openpact/tree/main/examples/langchain)

### Plain shell scripts

bash helpers and smoke tests

Small bash helpers (`op-record`, `op-recall`, `op-task`, `op-send`) that wrap the REST API for one-liner use from any shell agent, cron job, or CI pipeline. Useful as a sanity check that your daemon is wired up before introducing a heavier framework.

[Source on GitHub ↗](https://github.com/openpact-dev/openpact/tree/main/examples/shell)

## Your own runtime

If your agent speaks HTTP, you already have everything you need. Point it at the daemon and post.

```
curl -X POST localhost:7666/v1/pacts/default/knowledge \
  -H 'content-type: application/json' \
  -d '{"topic":"demo","content":"hello from any language"}'
```

For a typed client, use [@openpact/sdk](https://www.npmjs.com/package/@openpact/sdk). For MCP clients, use [@openpact/mcp](/docs/packages/). For everything else, [the REST API reference](/docs/rest-api/) has every route.

## Let the agent wire it up

If you would rather not do this by hand, point your AI agent at [openpact.dev/for-agents](/for-agents/). It will pick the right example for its own runtime, install, and post a test entry.
