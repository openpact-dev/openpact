# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Canonical resources

- **Domain**: `openpact.dev` (docs site lands here in Phase 4)
- **GitHub org**: `openpact-dev` — repo at `github.com/openpact-dev/openpact`
- **npm org**: `openpact` — packages published as `@openpact/<name>` (e.g. `@openpact/sdk`, `@openpact/daemon`)

## Repository status

**Phase 1 + Phase 2 complete.** Two daemons pair via the CLI, replicate entries through testnet, coordinate work via tasks (with TTL + race-safe claim semantics), and share verified skills. Three published-ready agent-integration packages plus four worked example integrations cover the realistic adoption surface.

Shipped:

- **Phase 1.1–1.5** — daemon (Corestore + Autobase + Hyperswarm), REST on `:7666`, CLI (`init / start / log / add-writer / ...`), full pair-and-replicate flow.
- **§2.1 `@openpact/skill`** — portable `SKILL.md` + `tools.json` for OpenClaw, Cursor / Windsurf rules, LangChain Python, custom runtimes.
- **§2.2 `@openpact/sdk`** — typed TypeScript client (CJS-only build), full error-class hierarchy, integration test against a real daemon.
- **§2.3 examples** — Claude Code curl recipe, full OpenClaw workspace (drift-guarded), LangChain Python loader (with pytest), and shell scripts. Each smoke-tested against a real daemon.
- **§2.4 task TTL + race tests** — configurable TTL (default 24h); deterministic per-peer expiry via timestamp-on-entry in the reducer; 3-daemon concurrent-claim race; offline-claimer recovery.
- **§2.5 skill checksum** — sha256 verified at POST and at GET `/:id/content`; tampering test; `requires_approval` flag round-trips through replication; new `SkillChecksumMismatchError` in the SDK error hierarchy.
- **§2.6 `@openpact/mcp`** — MCP server (18 tools) with one-line install for Claude Desktop / Code / Cursor / Windsurf / Zed.

Up next:

- **§2.2a — SDK ESM build** (precursor to Phase 3). `@openpact/sdk` adds `dist/esm/` alongside `dist/cjs/` and a dual-condition `"exports"` map. Hard prerequisite for the dashboard, which imports the SDK into a browser bundle.
- **Phase 3 — web dashboard** (`packages/dashboard/`, Vite + Preact, served by the daemon on `:7667`, all 6 screens, SSE for live updates, `--no-dashboard` for headless deployments). Plan + tradeoffs in `docs/OPENPACT_BUILD_PLAN.md` §3.

Source of truth for what to build:

- `docs/OPENPACT_DESIGN.md` — canonical functional design (product scope, architecture, data model, UX).
- `docs/OPENPACT_BUILD_PLAN.md` — phased build plan with concrete tech picks, endpoints, CLI verbs, conventions, and the v0.1.0 definition of done. Per-section ✅ marks reflect what's actually shipped.
- `docs/mockups/0*.html` — static HTML mockups of planned UI screens.

When asked to implement anything, **read both docs first**. Design doc is the *what/why*; build plan is the *how*. If a request contradicts either, raise it before writing code.

## What OpenPact is

A P2P daemon giving software agents (OpenClaw, Claude Code, LangChain, CrewAI, shell scripts — anything that speaks HTTP) a **shared, append-only memory**. Built on the Holepunch/Pear stack:

- **Hypercore** — one signed append-only log per agent
- **Autobase** — deterministic multi-writer merge into a single shared view
- **Hyperswarm + HyperDHT** — peer discovery, NAT traversal, encrypted streams
- **Hyperbee** — sorted KV on top of the view for indexed queries

No central server. Eventually consistent. Tamper-proof. The daemon exposes a local REST API on `localhost:7666`.

## Monorepo layout

```
openpact/
  packages/
    daemon/          # Autobase + Hyperswarm + fastify REST on :7666     [shipped]
    cli/             # commander-based openpact <verb>                    [shipped]
    sdk/             # @openpact/sdk — typed TS client                    [shipped]
    mcp/             # @openpact/mcp — MCP server wrapping the daemon     [shipped]
    skill/           # @openpact/skill — portable SKILL.md + tools.json   [shipped]
    dashboard/       # web dashboard (Vite + Preact) served on :7667       [later]
  examples/
    claude-code/     # paste-into-CLAUDE.md curl + jq recipe              [shipped]
    openclaw/        # OpenClaw workspace (drift-guarded SKILL.md copy)   [shipped]
    langchain/       # Python loader + pytest                             [shipped]
    shell/           # plain bash scripts (recall/record/tasks/send)      [shipped]
  docs/
```

**TypeScript** + npm workspaces. CommonJS module output (matches the
Pear/Hyper stack). All `.ts`, run via `tsx` (no build step for tests). The
Hyper stack itself ships zero `.d.ts` — we use ambient `declare module`
shims in `types/hyper-stack.d.ts` and `any`-typed bindings inside the
Daemon class. Don't propose another language without strong justification.

## Architectural invariants

Load-bearing. Don't violate without explicit user sign-off:

1. **No central server in the data path.** DHT bootstrap nodes and optional seed nodes for availability are fine; nothing else routes user data.
2. **REST on `localhost:7666` is the universal integration point.** Bind to `127.0.0.1` only — never `0.0.0.0`. SDK, MCP server, and the generic skill are conveniences that wrap it, not the only way in.
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

Optional dashboard runs on `:7667` (localhost only).

## CLI surface

```
openpact init                  # create pact (keypair + Autobase)
openpact join <key>            # join existing pact
openpact invite                # print join key
openpact start [--foreground]  # detached by default; --foreground to block
openpact stop                  # stop background daemon
openpact status                # pact info, peers, entry counts (formatted)
openpact peers                 # list connected peers + roles
openpact log [--type <type>]   # tail recent entries
```

Check PID file / port before starting to avoid double-launch.

## Writing style for user-facing copy

Plain English. Specifically:

- **No em-dashes** (`—`). Use a period, comma, parentheses, or rewrite. This applies to docs, the README, commit messages, and CLI output.
- **No marketing voice.** Skip "lightweight", "robust", "powerful", "first-class", "ships with", "leverage", "out of the box", "carefully crafted".
- **No "It's not X — it's Y" framing** or breathless triplets ("real, recent, verified").
- **No "Whether you're X, Y, or Z" intros.**
- **Short, direct sentences.** Subject → verb → object. Two simple sentences beat one with a parenthetical aside.

The CLI's themed copy (`sealed`, `summoned`, `banished`, `pact-bearer is bound`) is the brand voice and stays. The rule is about *prose* copy: README, docs, commit messages, error messages.

## Conventions

- **Data dir**: `~/.openpact/` containing `config.json` (pact key, keypair, role, port), `data/` (Corestore), `pid`.
- **Entry IDs**: `<core_short_id>-<sequence_number>` (e.g. `a7f2-412`).
- **Peer handles**: `anon-<word>-<4hex>` derived from public key (e.g. `anon-krait-7f2d`).
- **Task state machine**: `open → claimed → complete`. Claimer-only `release` returns to `open`. `open → complete` is allowed (skip-claim). Claims auto-expire after 24h (configurable).
- **Skill installs are never automatic** — surface for user approval, verify checksum on download.

## Phased delivery

Don't pull later-phase work forward until the current phase's test checkpoints pass.

- **Phase 1** ✅ — daemon, REST, CLI; two daemons sync entries P2P. Test checkpoint: post via curl on machine A, see it via `openpact log` on machine B.
- **Phase 2** ✅ — `@openpact/skill`, `@openpact/sdk`, `@openpact/mcp`, four worked examples (Claude Code, OpenClaw, LangChain, shell), task TTL + 3-daemon race tests, skill checksum verification + `requires_approval` round-trip.
- **Phase 3** — web dashboard (Vite + Preact) served by the daemon on `:7667`, all 6 screens (dashboard, knowledge, tasks, skills, network, entry trace), SSE for live updates. The dashboard uses `@openpact/sdk` against `baseUrl: '/api'`; both Vite (dev) and Fastify (prod) proxy `/api/*` to the daemon on `:7666`. No parallel `api.ts` in the dashboard package. **Precursor §2.2a**: SDK must ship dual CJS + ESM before Phase 3 starts.
- **Phase 4** — docs site, seed-node Docker image, security review, demo video, v0.1.0 launch.

## Definition of done for v0.1.0

Don't tag v0.1.0 until **all** of these hold (build plan §Definition of done):

- Two agents on different machines share knowledge, coordinate tasks, discover skills with zero central infra.
- OpenClaw agent works via the skill file with no custom code.
- CLI is a complete setup + monitoring experience.
- REST API is documented with request/response examples.
- Web dashboard shows all six screens with near-real-time updates.
- Seed node deploys in under 5 minutes.
- README explains what/why/how-to-start in under 2 minutes of reading.
- Repo has MIT licence, contributing guide, code of conduct.

## Working with the Pear/Hyper stack

For Pear runtime, CLI, config, or P2P primitive APIs — invoke the `/pears` skill rather than guessing. Pear ships frequently and flag drift is real.

## Commands

Run from the repo root unless noted. Requires Node.js ≥ 20.

| Command                     | What it does                                                  |
| --------------------------- | ------------------------------------------------------------- |
| `npm install`               | Install dev tooling and link workspaces.                      |
| `npm test`                  | Unit + integration tests via `brittle` + `tsx`.               |
| `npm run test:unit`         | Unit tests only.                                              |
| `npm run test:e2e`          | End-to-end CLI tests via `execa` subprocesses.                |
| `npm run test:examples`     | Smoke tests under `examples/*/test/`.                         |
| `npm run test:watch`        | Re-run unit tests on file change.                             |
| `npm run test:coverage`     | Run tests under `c8`; writes `coverage/lcov.info`. Enforces gates. |
| `npm run typecheck`         | `tsc --noEmit` over the whole repo.                           |
| `npm run lint`              | `eslint` (with `typescript-eslint`) + `prettier --check`.      |
| `npm run format`            | `prettier --write` over `packages/`.                          |

Single test file:
`NODE_OPTIONS='--import tsx' npx brittle packages/daemon/test/unit/<file>.test.ts`.

Workspaces: `@openpact/daemon`, `@openpact/cli`, `@openpact/sdk`,
`@openpact/mcp`, `@openpact/skill`, `openpact` (placeholder) under
`packages/*`, plus `examples/*` (currently `examples-claude-code`).
Root scripts are canonical and what CI runs.

**TypeScript setup:**
- Source + tests are all `.ts`, run via `tsx` (no build step for tests/CI;
  daemon ships precompiled in Phase 4)
- tsconfig: `module: commonjs`, `strict: true`, `noImplicitAny: false`
  (the Hyper stack is opaque — typed `any` deliberately)
- Ambient module declarations for Hyper packages in
  `types/hyper-stack.d.ts` (none of them ship `.d.ts`)
- ESLint flat config (`eslint.config.js`) extended with `typescript-eslint`

Coverage gate is enforced in CI:
- Global ≥ 80 / 75 lines/branches (currently sitting at ~95 / 82)
- `apply.ts` per-file ≥ 95 / 90 (post-test script `scripts/check-apply-coverage.js`)

`@openpact/sdk` and `@openpact/mcp` build CJS-only today — `tsc -p
tsconfig.cjs.json` per package emits `dist/cjs/` + `dist/types/`. Both
get rebuilt as part of `test:all` so a stale dist doesn't ship.

**Upcoming — §2.2a (precursor to Phase 3):** `@openpact/sdk` gains a
second `tsc -p tsconfig.esm.json` pass emitting `dist/esm/`, and a
dual-condition `"exports"` map (`import` → ESM, `require` → CJS,
`types` → `.d.ts`). `main` stays CJS for older tools. `publint` in
CI verifies both conditions resolve. The dashboard imports the SDK
directly (`import { OpenPact } from '@openpact/sdk'`), so shipping
proper ESM avoids relying on Vite's CJS pre-bundle for every build.

## Keep this file current

When new packages, scripts, or invariants land, **update this file in the same commit**. The Repository status, monorepo layout, and Commands tables are the parts most likely to drift. The architectural invariants and conventions are load-bearing — change them only with explicit user sign-off.
