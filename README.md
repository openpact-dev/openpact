<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/openpact-logo-512.png">
    <source media="(prefers-color-scheme: light)" srcset="docs/openpact-logo-light-512.png">
    <img alt="OpenPact" src="docs/openpact-logo-512.png" width="220">
  </picture>
</p>

<h1 align="center">OpenPact</h1>

<p align="center">
  <em>P2P shared memory for software agents.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/status-alpha-c40000?style=flat-square" alt="alpha">
  <img src="https://img.shields.io/badge/license-MIT-c40000?style=flat-square" alt="MIT">
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

Phase 1 is done. Two daemons can pair through the CLI, promote each other, and replicate entries. The full flow is covered by an end-to-end test.

Version 0.1.0 ships when phases 2 to 4 are done. The plan is in [`docs/OPENPACT_BUILD_PLAN.md`](docs/OPENPACT_BUILD_PLAN.md).

| Phase | Status | Detail |
| ----- | ------ | ------ |
| 1.1 monorepo and tooling   | 🔥 shipped | TypeScript, brittle, c8, ESLint, GitHub Actions |
| 1.2 daemon core            | 🔥 shipped | Corestore, Autobase, Hyperswarm. apply has 100/90 coverage. |
| 1.3 REST API on `:7666`    | 🔥 shipped | Fastify. All v1 routes, including the task state machine. |
| 1.4 CLI                    | 🔥 shipped | `openpact init / start / log` and friends. PID file management. |
| 1.5 two-daemon flow        | 🔥 shipped | `--bootstrap` flag plus `add-writer` and `remove-writer` commands. Full pair-and-replicate via the CLI. |
| 2.x agent integrations     | 🩸 next    | `@openpact/sdk`, OpenClaw skill, framework examples |
| 3.x desktop app            | 🕯 later   | Pear desktop, all 6 screens |
| 4.x docs and launch        | 🕯 later   | seed-node Docker image, security review, demo video |

| Resource    | Location                                                                     |
| ----------- | ---------------------------------------------------------------------------- |
| Website     | [openpact.dev](https://openpact.dev) (coming soon)                           |
| Source      | [github.com/openpact-dev/openpact](https://github.com/openpact-dev/openpact) |
| npm scope   | `@openpact/*`                                                                |
| Brand       | [`docs/OPENPACT_BRAND.md`](docs/OPENPACT_BRAND.md)                           |
| Licence     | MIT                                                                          |

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
openpact --data-dir /tmp/op start --daemon

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
openpact --data-dir /tmp/op-a start --daemon --port 7666
KEY=$(openpact --data-dir /tmp/op-a invite)

# Terminal B: enter the pact and summon.
openpact --data-dir /tmp/op-b join "$KEY"
openpact --data-dir /tmp/op-b start --daemon --port 7667

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

## 📜 Documentation

- [`docs/OPENPACT_DESIGN.md`](docs/OPENPACT_DESIGN.md). What it does and why.
- [`docs/OPENPACT_BUILD_PLAN.md`](docs/OPENPACT_BUILD_PLAN.md). The phased plan.
- [`docs/OPENPACT_ROADMAP.md`](docs/OPENPACT_ROADMAP.md). Vision for v0.2 and beyond. MCP server, federated pacts, public commons.
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
  <sub>🜏 a pact among daemons. MIT licence.</sub>
</p>
