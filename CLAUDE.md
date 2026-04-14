# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Canonical resources

- **Domain**: `openpact.dev` (docs site lands here in Phase 4)
- **GitHub org**: `openpact-dev` — repo at `github.com/openpact-dev/openpact`
- **npm org**: `openpact` — packages published as `@openpact/<name>` (e.g. `@openpact/sdk`, `@openpact/daemon`)

## Repository status

**Phase 1.1 complete.** Monorepo skeleton, lint/format/test tooling, and CI
matrix are wired up. No daemon, REST, CLI, or SDK code yet — those land in
Phase 1.2 onward. Source of truth for what to build:

- `docs/OPENPACT_DESIGN.md` — canonical functional design (product scope, architecture, data model, UX).
- `docs/OPENPACT_BUILD_PLAN.md` — phased build plan with concrete tech picks, endpoints, CLI verbs, conventions, and the v0.1.0 definition of done.
- `docs/0*.html` — static HTML mockups of planned UI screens.

When asked to implement anything, **read both docs first**. Design doc is the *what/why*; build plan is the *how*. If a request contradicts either, raise it before writing code.

## What OpenPact is

A P2P daemon giving software agents (OpenClaw, Claude Code, LangChain, CrewAI, shell scripts — anything that speaks HTTP) a **shared, append-only memory**. Built on the Holepunch/Pear stack:

- **Hypercore** — one signed append-only log per agent
- **Autobase** — deterministic multi-writer merge into a single shared view
- **Hyperswarm + HyperDHT** — peer discovery, NAT traversal, encrypted streams
- **Hyperbee** — sorted KV on top of the view for indexed queries

No central server. Eventually consistent. Tamper-proof. The daemon exposes a local REST API on `localhost:7331`.

## Planned monorepo layout

```
openpact/
  packages/
    daemon/          # Autobase + Hyperswarm + fastify REST on :7331
    cli/             # commander-based openpact <verb>
    sdk/             # @openpact/sdk (Phase 2)
    skill-openclaw/  # OpenClaw SKILL.md (Phase 2)
    desktop/         # Pear desktop app (Phase 3)
  examples/          # openclaw, langchain, claude-code, shell
  docs/
```

JavaScript / npm workspaces. The Pear/Hyper stack is JS-native — don't propose another language without strong justification.

## Architectural invariants

Load-bearing. Don't violate without explicit user sign-off:

1. **No central server in the data path.** DHT bootstrap nodes and optional seed nodes for availability are fine; nothing else routes user data.
2. **REST on `localhost:7331` is the universal integration point.** Bind to `127.0.0.1` only — never `0.0.0.0`. SDK and OpenClaw skill are conveniences that wrap it, not the only way in.
3. **Autobase `apply` is the single ordering authority.** All entry validation, writer-permission changes (`addWriter`/`removeWriter` via `admin` entries), and view shape decisions happen there.
4. **Entry schema is fixed at four types**: `knowledge`, `task`, `skill`, `message`. Each entry: `{type, timestamp, agent_id, payload, refs, ttl}`. Adding a new top-level type requires a design-doc update first.
5. **Peer roles**: Creator, Indexer, Writer, Reader. A majority of indexers must be online to advance the confirmed frontier.
6. **MIT-licensed, fully open source.** No proprietary modules in the daemon path.

## Tech stack (per build plan §Technical decisions)

| Concern | Pick |
|---|---|
| Append-only log | `hypercore` |
| Multi-writer merge | `autobase` |
| Peer discovery | `hyperswarm` |
| Core management | `corestore` |
| Indexed view queries | `hyperbee` |
| HTTP server | `fastify` |
| CLI parsing | `commander` |

Don't substitute these without raising it — they're chosen for fit with the Pear ecosystem.

## REST API contract

Stable surface (build plan §1.3, §2):

```
GET  /v1/ping                                 -> { ok: true }
GET  /v1/status                               -> { pact_id, peers, entries, synced }
GET  /v1/peers                                -> [{ id, role, entries, online }]

GET  /v1/knowledge?topic=&limit=
POST /v1/knowledge

GET  /v1/tasks?status=open|claimed|complete
POST /v1/tasks
GET  /v1/tasks/:id                            -> includes claim history
PUT  /v1/tasks/:id/claim
PUT  /v1/tasks/:id/complete

GET  /v1/skills?format=openclaw|langchain|generic
POST /v1/skills
GET  /v1/skills/:id/content                   -> verifies checksum

GET  /v1/messages?since=TIMESTAMP
POST /v1/messages
```

**Error envelope** (uniform):
```json
{ "error": "TASK_ALREADY_CLAIMED", "message": "...", "status": 409 }
```
Codes: `400` malformed, `404` missing, `409` conflict, `500` daemon error.

Optional dashboard runs on `:7332` (localhost only).

## CLI surface

```
openpact init                  # create pact (keypair + Autobase)
openpact join <key>            # join existing pact
openpact invite                # print join key
openpact start [--daemon]      # foreground or detached
openpact stop                  # stop background daemon
openpact status                # pact info, peers, entry counts (formatted)
openpact peers                 # list connected peers + roles
openpact log [--type <type>]   # tail recent entries
```

Check PID file / port before starting to avoid double-launch.

## Conventions

- **Data dir**: `~/.openpact/` containing `config.json` (pact key, keypair, role, port), `data/` (Corestore), `pid`.
- **Entry IDs**: `<core_short_id>-<sequence_number>` (e.g. `a7f2-412`).
- **Peer handles**: `anon-<word>-<4hex>` derived from public key (e.g. `anon-krait-7f2d`).
- **Task state machine**: `open → claimed → complete`. Claimer-only `release` returns to `open`. `open → complete` is allowed (skip-claim). Claims auto-expire after 24h (configurable).
- **Skill installs are never automatic** — surface for user approval, verify checksum on download.

## Phased delivery

Don't pull later-phase work forward until the current phase's test checkpoints pass.

- **Phase 1** — daemon, REST, CLI; two daemons sync entries P2P. Test checkpoint: post via curl on machine A, see it via `openpact log` on machine B.
- **Phase 2** — OpenClaw skill, `@openpact/sdk`, framework examples, task claim/release/timeout, skill format filtering + checksum verify.
- **Phase 3** — Pear desktop app, all 6 screens (dashboard, knowledge, tasks, skills, network, entry trace), polls daemon every 5s.
- **Phase 4** — docs site, seed-node Docker image, security review, demo video, v0.1.0 launch.

## Definition of done for v0.1.0

Don't tag v0.1.0 until **all** of these hold (build plan §Definition of done):

- Two agents on different machines share knowledge, coordinate tasks, discover skills with zero central infra.
- OpenClaw agent works via the skill file with no custom code.
- CLI is a complete setup + monitoring experience.
- REST API is documented with request/response examples.
- Desktop app shows all six screens with near-real-time updates.
- Seed node deploys in under 5 minutes.
- README explains what/why/how-to-start in under 2 minutes of reading.
- Repo has MIT licence, contributing guide, code of conduct.

## Working with the Pear/Hyper stack

For Pear runtime, CLI, config, or P2P primitive APIs — invoke the `/pears` skill rather than guessing. Pear ships frequently and flag drift is real. The desktop app (Phase 3) uses `pear-electron`.

## Commands

Run from the repo root unless noted. Requires Node.js ≥ 20.

| Command                     | What it does                                          |
| --------------------------- | ----------------------------------------------------- |
| `npm install`               | Install dev tooling and link workspaces.              |
| `npm test`                  | Unit + integration tests via `brittle`.               |
| `npm run test:unit`         | Unit tests only.                                      |
| `npm run test:e2e`          | End-to-end CLI tests (no tests until Phase 1.4).      |
| `npm run test:watch`        | Re-run unit tests on file change.                     |
| `npm run test:coverage`     | Run tests under `c8`; writes `coverage/lcov.info`.    |
| `npm run lint`              | `eslint` + `prettier --check` over `packages/`.       |
| `npm run format`            | `prettier --write` over `packages/`.                  |

Single test file: `npx brittle packages/daemon/test/unit/<file>.test.js`.

Workspaces: `@openpact/daemon` and `@openpact/cli` live under `packages/*`.
Per-package scripts (e.g. `npm test -w @openpact/daemon`) work but the root
scripts are the canonical entry point and what CI runs.

ESLint config is **flat config** (`eslint.config.js`), not legacy
`.eslintrc.json`. CommonJS modules throughout (no ESM yet).

Coverage thresholds (`daemon` 80/75, `cli` 70/65, `apply` 95/90) are
**defined in the build plan but not yet enforced** — `c8 --check-coverage`
turns on in Phase 1.2 once there's real code to cover. Until then
`test:coverage` only reports.

## When tooling lands

Once `package.json` + scripts exist, **update this file** with actual commands. Done as of Phase 1.1 — keep this section current as new scripts (daemon start, build, type-check) come online.
