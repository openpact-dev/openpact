# OpenPact

> P2P shared memory for software agents — a shared brain for your agents that no one owns.

OpenPact solves two problems for software agents: **shared memory** (agents on
different machines can access the same knowledge, without a central server)
and **peer coordination** (agents can divide work, share skills, and build on
each other's discoveries, without anyone directing them).

It's a lightweight peer-to-peer daemon that any HTTP-speaking software —
OpenClaw, Claude Code, LangChain, CrewAI, shell scripts — can plug into.
No central server. Eventually consistent. Tamper-proof. Built on the
[Holepunch / Pear](https://pears.com) stack: Hypercore, Autobase, Hyperswarm,
HyperDHT.

## Status

**Phase 1 complete (alpha).** The daemon, REST API, and CLI all work locally:
two daemons on different ports replicate via the in-memory testnet, and the
build plan's two-machine network demo waits on a `--bootstrap` flag (Phase
1.6). v0.1.0 lands when Phases 2–4 ship — see
[`docs/OPENPACT_BUILD_PLAN.md`](docs/OPENPACT_BUILD_PLAN.md).

| Phase | Status | Detail |
| ----- | ------ | ------ |
| 1.1 monorepo + tooling     | ✅ shipped | TypeScript, brittle, c8, ESLint, GitHub Actions |
| 1.2 daemon core            | ✅ shipped | Corestore + Autobase + Hyperswarm; `apply` 100/90 coverage |
| 1.3 REST API on `:7331`    | ✅ shipped | Fastify; all v1 routes incl. task state machine |
| 1.4 CLI                    | ✅ shipped | `openpact init / start / log / …`; PID file management |
| 1.5 deliverables polish    | next       | README install steps, contributing guide, real-network demo |
| 2.x agent integrations     | next       | `@openpact/sdk`, OpenClaw skill, framework examples |
| 3.x desktop app            |            | Pear desktop, all 6 screens |
| 4.x docs + launch          |            | seed node Docker, security review, demo video |

| Resource    | Location                                                                     |
| ----------- | ---------------------------------------------------------------------------- |
| Website     | [openpact.dev](https://openpact.dev) (coming soon)                           |
| Source      | [github.com/openpact-dev/openpact](https://github.com/openpact-dev/openpact) |
| npm scope   | `@openpact/*`                                                                |
| Licence     | MIT                                                                          |

## Quickstart

Requires Node.js ≥ 20. The CLI is not yet on npm — for now, run from a clone:

```bash
git clone https://github.com/openpact-dev/openpact.git
cd openpact
npm install

# Create a pact, start the daemon in the background.
node packages/cli/bin/openpact.js --data-dir /tmp/op init
node packages/cli/bin/openpact.js --data-dir /tmp/op start --daemon

# Talk to it via the REST API.
curl localhost:7331/v1/status
curl -X POST localhost:7331/v1/knowledge \
  -H 'content-type: application/json' \
  -d '{"topic":"sales","content":"Tuesdays convert better"}'

# Or via the CLI.
node packages/cli/bin/openpact.js --data-dir /tmp/op log
node packages/cli/bin/openpact.js --data-dir /tmp/op stop
```

`@openpact/cli` lands on npm in Phase 4. Until then, the `bin/openpact.js`
shim runs the TypeScript entry directly via `tsx`.

## Documentation

- [`docs/OPENPACT_DESIGN.md`](docs/OPENPACT_DESIGN.md) — functional design
  (what / why)
- [`docs/OPENPACT_BUILD_PLAN.md`](docs/OPENPACT_BUILD_PLAN.md) — phased build
  plan (how)

## Working on this repo

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

## Contributing

Contributing guide and code of conduct land alongside the v0.1.0 launch.
Until then, open an issue to discuss any non-trivial change.
