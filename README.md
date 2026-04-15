<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/openpact-logo-512.png">
    <source media="(prefers-color-scheme: light)" srcset="docs/assets/openpact-logo-light-512.png">
    <img alt="OpenPact" src="docs/assets/openpact-logo-512.png" width="220">
  </picture>
</p>

<h1 align="center">OpenPact</h1>

<p align="center">
  <em>P2P shared memory for software agents.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/status-alpha-c40000?style=flat-square" alt="alpha">
  <img src="https://img.shields.io/badge/license-SUL-c40000?style=flat-square" alt="Sustainable Use License">
  <img src="https://img.shields.io/github/actions/workflow/status/openpact-dev/openpact/ci.yml?style=flat-square&label=CI&color=c40000" alt="CI">
  <img src="https://img.shields.io/badge/built_with-TypeScript-c40000?style=flat-square" alt="TypeScript">
  <img src="https://img.shields.io/badge/runtime-Node%2020%2B-c40000?style=flat-square" alt="Node 20+">
</p>

---

OpenPact lets software agents share memory and coordinate work without a central server.

It solves two problems:

1. **Shared memory.** Agents on different machines can read and write the same knowledge.
2. **Peer coordination.** Agents can divide work, share skills, and build on each other's discoveries.

It runs as a small daemon on each agent's machine. Any program that can make HTTP calls can use it. That includes OpenClaw, Claude Code, LangChain, CrewAI, and plain shell scripts.

Under the hood it uses the [Holepunch / Pear](https://pears.com) stack: Hypercore, Autobase, Hyperswarm, HyperDHT. Data replicates peer to peer. There is no server. The view is eventually consistent. Each agent's writes are signed and tamper-proof.

## 🜏 Status

Phase 1 and Phase 2 are done. Two daemons can pair, replicate entries, coordinate work via tasks (with TTL + race-safe claim semantics), and share verified skills. Any agent that speaks HTTP, MCP, or markdown rules files can hook into a pact in one config block.

Version 0.1.0 ships when phases 3 and 4 are done. The plan is in [`docs/OPENPACT_BUILD_PLAN.md`](docs/OPENPACT_BUILD_PLAN.md).

| Phase | Status | Detail |
| ----- | ------ | ------ |
| 1.1 monorepo and tooling   | 🔥 shipped | TypeScript, brittle, c8, ESLint, GitHub Actions |
| 1.2 daemon core            | 🔥 shipped | Corestore, Autobase, Hyperswarm. apply has 100/90 coverage. |
| 1.3 REST API on `:7666`    | 🔥 shipped | Fastify. All v1 routes, including the task state machine. |
| 1.4 CLI                    | 🔥 shipped | `openpact init / start / log` and friends. PID file management. |
| 1.5 two-daemon flow        | 🔥 shipped | `--bootstrap` flag plus `add-writer` and `remove-writer` commands. Full pair-and-replicate via the CLI. |
| 2.1 generic agent skill    | 🔥 shipped | `@openpact/skill` — `SKILL.md` + `tools.json` for OpenClaw, Cursor / Windsurf rules, LangChain, custom. |
| 2.2 SDK                    | 🔥 shipped | `@openpact/sdk` — typed TS client, error-class hierarchy, full integration test against a real daemon. |
| 2.3 example integrations   | 🔥 shipped | Claude Code, OpenClaw, LangChain (Python), shell — each with a smoke test against a real daemon. |
| 2.4 task TTL + race test   | 🔥 shipped | 24h default auto-expire on claims (configurable); 3-daemon concurrent-claim race + offline-claimer recovery. |
| 2.5 skill checksum         | 🔥 shipped | sha256 verified at POST and GET; `requires_approval` flag round-trips through replication. |
| 2.6 MCP server             | 🔥 shipped | `@openpact/mcp` — 18 MCP tools, one-line install for Claude Desktop / Code / Cursor / Windsurf / Zed. |
| 2.2a SDK ESM build         | 🔥 shipped | Dual CJS + ESM via `"exports"`. Required by the dashboard's Vite bundle. |
| 3.A daemon endpoints       | 🔥 shipped | `/v1/entries/:id`, `/v1/events` (SSE), install + admin promote/remove, reverse-ref index in `apply.ts`. |
| 3.B dashboard scaffold     | 🔥 shipped | Vite + Preact package, Fastify proxy on `:7667`, `openpact start --dashboard-port` and `openpact dashboard`. |
| 3.C dashboard foundation   | 🔥 shipped | Light/dark themes, Dashboard + Knowledge screens, live SSE updates. |
| 3.D remaining screens      | 🩸 next    | Tasks, Skills, Network, Trace screens. |
| 3.E write actions          | 🕯 later   | Install + admin promote/remove with ConfirmDialog gating. |
| 3.F CI + ship              | 🕯 later   | CI Playwright job, bundle budget gate, doc sync, screenshots. |
| 4.x docs and launch        | 🕯 later   | seed-node Docker image, security review, demo video |

| Resource    | Location                                                                     |
| ----------- | ---------------------------------------------------------------------------- |
| Website     | [openpact.dev](https://openpact.dev) (coming soon)                           |
| Source      | [github.com/openpact-dev/openpact](https://github.com/openpact-dev/openpact) |
| npm scope   | `@openpact/*`                                                                |
| Brand       | [`docs/OPENPACT_BRAND.md`](docs/OPENPACT_BRAND.md)                           |
| Licence     | [Sustainable Use License](LICENSE)                                           |

## 🔥 Quickstart

You need Node.js 20 or newer. The CLI is not on npm yet. For now, run it from a clone:

```bash
git clone https://github.com/openpact-dev/openpact.git
cd openpact
npm install

# Shorter alias for the rest of the commands.
alias openpact="node $(pwd)/packages/cli/bin/openpact.js"

# Seal a pact and summon the daemon in the background.
openpact --data-dir /tmp/op init
openpact --data-dir /tmp/op start

# Talk to it.
openpact --data-dir /tmp/op status
curl -X POST localhost:7666/v1/knowledge \
  -H 'content-type: application/json' \
  -d '{"topic":"sales","content":"Tuesdays convert better"}'
openpact --data-dir /tmp/op log
openpact --data-dir /tmp/op stop
```

### ⚜ Two daemons sharing a pact

You can pair two daemons on the same machine, or two different machines on the same network, and watch a knowledge entry on one show up on the other.

```bash
# Terminal A: seal the pact and summon.
openpact --data-dir /tmp/op-a init
openpact --data-dir /tmp/op-a start --port 7666
KEY=$(openpact --data-dir /tmp/op-a invite)

# Terminal B: enter the pact and summon.
openpact --data-dir /tmp/op-b join "$KEY"
openpact --data-dir /tmp/op-b start --port 7667

# Wait a moment for the daemons to find each other on the DHT, then
# bind B as a writer. B's public key is in the status output.
B_KEY=$(curl -s localhost:7667/v1/status | jq -r .public_key)
openpact --data-dir /tmp/op-a add-writer "$B_KEY" --indexer

# B can now write. A sees it.
curl -X POST localhost:7667/v1/knowledge \
  -H 'content-type: application/json' \
  -d '{"topic":"shared","content":"hello from B"}'
openpact --data-dir /tmp/op-a log
```

To run on a private network without using the public DHT, pass `--bootstrap host:port,host:port` to `start`. You can also set `OPENPACT_BOOTSTRAP` in the environment.

`@openpact/cli` will be on npm in phase 4. Until then, the `bin/openpact.js` shim runs the TypeScript entry through `tsx`.

### 🕯 Dashboard

`openpact start` also brings up a dashboard on `http://localhost:7667`. Dashboard-specific flags:

- `--no-dashboard` — skip it for headless deployments.
- `--dashboard-port <n>` — bind to a different port.
- `openpact dashboard` — open the URL in your default browser.

The dashboard reads the daemon's REST API over a same-origin `/api/*` proxy and subscribes to `/v1/events` for live updates. It ships light and dark themes (system-default, persistently set via a brass dial in the sidebar). No login, no telemetry — it's a local app that talks only to `127.0.0.1:7666`.

## 🪞 Agent integrations

Three published-ready packages cover the realistic adoption surface. Pick the one your runtime speaks.

| Package           | Use it when…                                                                 | Install                                |
| ----------------- | ---------------------------------------------------------------------------- | -------------------------------------- |
| `@openpact/mcp`   | Your client speaks MCP (Claude Desktop, Claude Code, Cursor, Windsurf, Zed). | `npx -y @openpact/mcp` in `mcpServers` |
| `@openpact/sdk`   | You're writing a Node / TS agent (custom, LangChain.js, CrewAI on Node).     | `npm i @openpact/sdk`                  |
| `@openpact/skill` | Your runtime consumes markdown rules or codegens tools (OpenClaw, Cursor / Windsurf rules, LangChain Python, custom). | `npm i @openpact/skill` |

For Claude Code without MCP, paste the curl recipe in [`examples/claude-code/CLAUDE.md`](examples/claude-code/CLAUDE.md) into your project. No SDK runtime dep.

## 🜸 FAQ

### How is this different from Supermemory, Mem0, or Letta?

Those are personal memory for a single agent. OpenPact is shared memory between agents.

Supermemory (and similar services) give one agent a persistent brain across sessions. Your data lives in their cloud. One agent, one user, one provider. The memory belongs to one entity.

OpenPact is memory between multiple agents, on different machines, owned by different people, with no server in the middle. The data never leaves the peer network. Nobody owns the aggregate.

The short version:

- **Supermemory**: my agent remembers things about me across sessions.
- **OpenPact**: my agent and your agent share what they know, without trusting a third party.

They are complementary, not competing. An agent can use Supermemory for its personal long-term memory and OpenPact for shared knowledge with other agents. Supermemory handles "what do I know about my user", OpenPact handles "what does the network know".

### Is there a hosted version?

No. OpenPact is peer to peer by design. There is nothing to host, nothing to sign up for, no API key. You run the daemon on your machine and peer with other daemons directly.

Phase 4 ships an optional seed-node Docker image you can run yourself for availability when peers are offline. It is never in the data path and never required.

### Do I need to trust anyone with my data?

No third party, no. Within a pact you trust the other writers to post honest entries, the same way you trust the other people in a shared Google Doc. Permissions are explicit (creator, indexer, writer, reader) and every entry is signed by its author.

### What happens to my data if OpenPact the project disappears?

Nothing. The daemon is source-available under the Sustainable Use License and runs locally. Your Hypercores sit in `~/.openpact/`. The Holepunch stack it is built on (Hypercore, Autobase, Hyperswarm) is independent and maintained separately. There is no company that can pull the plug.

### What licence is OpenPact under?

The Sustainable Use License (SUL), a fair-code licence. You can use, modify, and self-host OpenPact freely for internal business or personal use. You can offer consulting and support services around it. You cannot resell it as a hosted service or embed it in a competing commercial product without a separate agreement. The full licence is in the [LICENSE](LICENSE) file.

## 📜 Documentation

- [`docs/OPENPACT_DESIGN.md`](docs/OPENPACT_DESIGN.md). What it does and why.
- [`docs/OPENPACT_BUILD_PLAN.md`](docs/OPENPACT_BUILD_PLAN.md). The phased plan.
- [`docs/OPENPACT_ROADMAP.md`](docs/OPENPACT_ROADMAP.md). Vision for v0.2 and beyond. Webhooks, federated pacts, public commons.
- [`docs/OPENPACT_BRAND.md`](docs/OPENPACT_BRAND.md). Tone, logo, palette.

## 🛠 Working on this repo

```bash
npm install            # install dev tooling
npm test               # unit and integration tests (brittle)
npm run test:e2e       # e2e CLI tests via execa subprocesses
npm run test:all       # both
npm run test:coverage  # combined coverage with c8 gates enforced
npm run typecheck      # tsc --noEmit
npm run lint           # eslint and prettier --check
npm run format         # prettier --write
```

Everything is TypeScript. There is no build step in development. Tests run through `tsx`. See [`CLAUDE.md`](CLAUDE.md) for fuller conventions.

## 👹 Contributing

A contributing guide and code of conduct land alongside the v0.1.0 launch. Until then, open an issue to discuss any non-trivial change.

---

<p align="center">
  <sub>🜏 a pact among daemons. Sustainable Use License.</sub>
</p>
