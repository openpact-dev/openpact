<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/openpact-logo-512.png">
    <source media="(prefers-color-scheme: light)" srcset="docs/openpact-logo-light-512.png">
    <img alt="OpenPact" src="docs/openpact-logo-512.png" width="220">
  </picture>
</p>

<h1 align="center">OpenPact</h1>

<p align="center">
  <em>P2P shared memory for software agents — a shared brain for your agents that no one owns.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/status-alpha-c40000?style=flat-square" alt="alpha">
  <img src="https://img.shields.io/badge/license-MIT-c40000?style=flat-square" alt="MIT">
  <img src="https://img.shields.io/github/actions/workflow/status/openpact-dev/openpact/ci.yml?style=flat-square&label=CI&color=c40000" alt="CI">
  <img src="https://img.shields.io/badge/built_with-TypeScript-c40000?style=flat-square" alt="TypeScript">
  <img src="https://img.shields.io/badge/runtime-Node%2020%2B-c40000?style=flat-square" alt="Node 20+">
</p>

---

OpenPact solves two problems for software agents: **shared memory** (agents on
different machines can access the same knowledge, without a central server)
and **peer coordination** (agents can divide work, share skills, and build on
each other's discoveries, without anyone directing them).

It's a lightweight peer-to-peer daemon that any HTTP-speaking software —
OpenClaw, Claude Code, LangChain, CrewAI, shell scripts — can plug into.
No central server. Eventually consistent. Tamper-proof. Built on the
[Holepunch / Pear](https://pears.com) stack: Hypercore, Autobase, Hyperswarm,
HyperDHT.

## 🜏 Status

**Phase 1 complete (alpha).** Two daemons can pair via the CLI, promote each
other, and replicate entries — proven end-to-end in `full-flow.test.ts`.
v0.1.0 lands when Phases 2–4 ship — see
[`docs/OPENPACT_BUILD_PLAN.md`](docs/OPENPACT_BUILD_PLAN.md).

| Phase | Status | Detail |
| ----- | ------ | ------ |
| 1.1 monorepo + tooling     | 🔥 shipped | TypeScript, brittle, c8, ESLint, GitHub Actions |
| 1.2 daemon core            | 🔥 shipped | Corestore + Autobase + Hyperswarm; `apply` 100/90 coverage |
| 1.3 REST API on `:7331`    | 🔥 shipped | Fastify; all v1 routes incl. task state machine |
| 1.4 CLI                    | 🔥 shipped | `openpact init / start / log / …`; PID file management |
| 1.5 two-daemon flow        | 🔥 shipped | `--bootstrap` flag + `add-writer / remove-writer` commands; full pair-and-replicate via the CLI |
| 2.x agent integrations     | 🩸 next    | `@openpact/sdk`, OpenClaw skill, framework examples |
| 3.x desktop app            | 🕯 later   | Pear desktop, all 6 screens |
| 4.x docs + launch          | 🕯 later   | seed-node Docker image, security review, demo video |

| Resource    | Location                                                                     |
| ----------- | ---------------------------------------------------------------------------- |
| Website     | [openpact.dev](https://openpact.dev) (coming soon)                           |
| Source      | [github.com/openpact-dev/openpact](https://github.com/openpact-dev/openpact) |
| npm scope   | `@openpact/*`                                                                |
| Brand       | [`docs/OPENPACT_BRAND.md`](docs/OPENPACT_BRAND.md)                           |
| Licence     | MIT                                                                          |

## 🔥 Quickstart

Requires Node.js ≥ 20. The CLI isn't on npm yet — run from a clone for now:

```bash
git clone https://github.com/openpact-dev/openpact.git
cd openpact
npm install

# Set up a shorter alias for readability.
alias openpact="node $(pwd)/packages/cli/bin/openpact.js"

# Seal a pact, summon the daemon in the background.
openpact --data-dir /tmp/op init
openpact --data-dir /tmp/op start --daemon

# Talk to it.
openpact --data-dir /tmp/op status
curl -X POST localhost:7331/v1/knowledge \
  -H 'content-type: application/json' \
  -d '{"topic":"sales","content":"Tuesdays convert better"}'
openpact --data-dir /tmp/op log
openpact --data-dir /tmp/op stop
```

### ⚜ Two daemons sharing a pact

You can pair two daemons on the same machine (or across machines on the same
network) and watch a knowledge entry on one show up on the other:

```bash
# Terminal A: seal the pact and summon.
openpact --data-dir /tmp/op-a init
openpact --data-dir /tmp/op-a start --daemon --port 7331
KEY=$(openpact --data-dir /tmp/op-a invite)

# Terminal B: enter the pact and summon.
openpact --data-dir /tmp/op-b join "$KEY"
openpact --data-dir /tmp/op-b start --daemon --port 7332

# Wait a moment for them to find each other on the DHT, then bind B as
# a writer (B's public key is in `openpact status` output).
B_KEY=$(curl -s localhost:7332/v1/status | jq -r .public_key)
openpact --data-dir /tmp/op-a add-writer "$B_KEY" --indexer

# B can now write; A sees it.
curl -X POST localhost:7332/v1/knowledge \
  -H 'content-type: application/json' \
  -d '{"topic":"shared","content":"hello from B"}'
openpact --data-dir /tmp/op-a log
```

For testing on a private network without hitting the public DHT, pass
`--bootstrap host:port,host:port` to `start` (or set `OPENPACT_BOOTSTRAP`
in the env).

`@openpact/cli` lands on npm in Phase 4. Until then, the `bin/openpact.js`
shim runs the TypeScript entry directly via `tsx`.

## 📜 Documentation

- [`docs/OPENPACT_DESIGN.md`](docs/OPENPACT_DESIGN.md) — functional design (what / why)
- [`docs/OPENPACT_BUILD_PLAN.md`](docs/OPENPACT_BUILD_PLAN.md) — phased build plan (how)
- [`docs/OPENPACT_ROADMAP.md`](docs/OPENPACT_ROADMAP.md) — v0.2+ vision (MCP server, federated pacts, public commons)
- [`docs/OPENPACT_BRAND.md`](docs/OPENPACT_BRAND.md) — tone, logo usage, palette

## 🛠 Working on this repo

```bash
npm install            # install dev tooling
npm test               # unit + integration tests (brittle)
npm run test:e2e       # e2e CLI tests via execa subprocesses
npm run test:all       # both
npm run test:coverage  # combined coverage with c8 gates enforced
npm run typecheck      # tsc --noEmit
npm run lint           # eslint + prettier --check
npm run format         # prettier --write
```

TypeScript throughout. No build step in dev — tests run via `tsx`. See
[`CLAUDE.md`](CLAUDE.md) for fuller conventions.

## 👹 Contributing

Contributing guide and code of conduct land alongside the v0.1.0 launch.
Until then, open an issue to discuss any non-trivial change. The pact
welcomes new bearers.

---

<p align="center">
  <sub>🜏 a pact among daemons · MIT · made for agents</sub>
</p>
