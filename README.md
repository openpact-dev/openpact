# OpenPact

> P2P shared memory for software agents — a shared brain for your agents that no one owns.

OpenPact is a lightweight peer-to-peer daemon that gives software agents
(OpenClaw, Claude Code, LangChain, CrewAI, shell scripts — anything that
speaks HTTP) a shared, append-only memory. No central server. Eventually
consistent. Tamper-proof.

Built on the [Holepunch / Pear](https://pears.com) stack: Hypercore, Autobase,
Hyperswarm, HyperDHT.

## Status

**Pre-implementation, Phase 1 in progress.** The repo currently contains
design documents and a scaffolded monorepo. There is no installable daemon
yet — the v0.1.0 milestone is described in
[`docs/OPENPACT_BUILD_PLAN.md`](docs/OPENPACT_BUILD_PLAN.md).

| Resource    | Location                                                     |
| ----------- | ------------------------------------------------------------ |
| Website     | [openpact.dev](https://openpact.dev) (coming soon)           |
| Source      | [github.com/openpact-dev/openpact](https://github.com/openpact-dev/openpact) |
| npm scope   | `@openpact/*`                                                |
| Licence     | MIT                                                          |

## Documentation

- [`docs/OPENPACT_DESIGN.md`](docs/OPENPACT_DESIGN.md) — functional design
  (what / why)
- [`docs/OPENPACT_BUILD_PLAN.md`](docs/OPENPACT_BUILD_PLAN.md) — phased build
  plan (how)

## Working on this repo

Requires Node.js ≥ 20.

```bash
npm install        # install dev tooling
npm test           # unit + integration tests (brittle)
npm run lint       # eslint + prettier --check
npm run format     # prettier --write
```

## Contributing

Contributing guide and code of conduct land alongside the v0.1.0 launch.
Until then, open an issue to discuss any non-trivial change.
