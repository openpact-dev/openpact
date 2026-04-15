# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Canonical resources

- **Domain**: `openpact.dev` (docs site lands here in Phase 4)
- **GitHub org**: `openpact-dev` — repo at `github.com/openpact-dev/openpact`
- **npm org**: `openpact` — packages published as `@openpact/<name>` (e.g. `@openpact/sdk`, `@openpact/daemon`)

## Repository status

**Phases 1, 2, 3, 4a, and 4b complete.** Two daemons pair via the CLI, replicate entries through testnet, coordinate work via tasks (with TTL + race-safe claim semantics), and share verified skills. Three published-ready agent-integration packages plus four worked example integrations cover the realistic adoption surface. A full-featured web dashboard runs on `:7667` alongside the daemon (seven screens: Dashboard / Knowledge / Tasks / Skills / Network / Trace / Pacts), renders a Preact SPA fed by the SDK through a same-origin `/api/*` proxy with SSE push for live updates, and gates destructive actions (skill install, admin promote, admin remove) behind a ConfirmDialog. A single daemon process can hold many pacts; the CLI, REST surface (`/v1/pacts/:pactId/*`), SDK, and dashboard all address pacts by alias.

Shipped:

- **Phase 1.1–1.5** — daemon (Corestore + Autobase + Hyperswarm), REST on `:7666`, CLI (`init / start / log / add-writer / ...`), full pair-and-replicate flow.
- **§2.1 `@openpact/skill`** — portable `SKILL.md` + `tools.json` for OpenClaw, Cursor / Windsurf rules, LangChain Python, custom runtimes.
- **§2.2 `@openpact/sdk`** — typed TypeScript client with dual CJS + ESM build, full error-class hierarchy, integration test against a real daemon.
- **§2.3 examples** — Claude Code curl recipe, full OpenClaw workspace (drift-guarded), LangChain Python loader (with pytest), and shell scripts. Each smoke-tested against a real daemon.
- **§2.4 task TTL + race tests** — configurable TTL (default 24h); deterministic per-peer expiry via timestamp-on-entry in the reducer; 3-daemon concurrent-claim race; offline-claimer recovery.
- **§2.5 skill checksum** — sha256 verified at POST and at GET `/:id/content`; tampering test; `requires_approval` flag round-trips through replication; new `SkillChecksumMismatchError` in the SDK error hierarchy.
- **§2.6 `@openpact/mcp`** — MCP server (18 tools) with one-line install for Claude Desktop / Code / Cursor / Windsurf / Zed.
- **§2.2a — SDK ESM build** — `dist/esm/` alongside `dist/cjs/` with a dual-condition `"exports"` map. Required for the dashboard's Vite bundle.
- **§3 slices A–F** — daemon entries/SSE/install/admin endpoints + reverse-ref index, dashboard scaffold (Vite + Preact + Tailwind v4), all six screens, install + admin write actions gated by ConfirmDialog, CI `dashboard` job with bundle budget gate (JS ≤ 100KB / CSS ≤ 20KB gzipped). Logos regenerated from the dashboard's WatchingEye mark.
- **§4a identity** — `display_name` on every entry (advisory; `agent_id` stays canonical), pact name + purpose, interactive `openpact init` + `join` with themed word-list defaults. `@inquirer/prompts` respects `--no-interactive` for CI.
- **§4b multi-pact** — one daemon holds many pacts. Data layout is `~/.openpact/{daemon.json, pacts/<alias>/{config.json, data/}}`. REST moved under `/v1/pacts/:pactId/*`; host-level surface adds `/v1/pacts` (list/create/join/switch) and `/v1/pacts/:pactId` (rename/remove). SDK takes an optional `pactId`. CLI adds `openpact list / switch / rename / remove` and a `--pact <alias>` flag on every per-pact verb. Dashboard gets a sidebar PactSwitcher and a `/pacts` management page.

Up next:

- **Phase 4 launch polish** — docs site on `openpact.dev`, seed-node Docker image, security review, demo video, v0.1.0 tag. Plan in `docs/OPENPACT_BUILD_PLAN.md` §4.

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
    sdk/             # @openpact/sdk — typed TS client (dual CJS+ESM)     [shipped]
    mcp/             # @openpact/mcp — MCP server wrapping the daemon     [shipped]
    skill/           # @openpact/skill — portable SKILL.md + tools.json   [shipped]
    dashboard/       # Vite + Preact SPA + Fastify proxy on :7667          [slices A–C shipped]
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
4. **Entry schema is fixed at four types**: `knowledge`, `task`, `skill`, `message`. Each entry: `{type, timestamp, agent_id, display_name?, payload, refs, ttl}`. `agent_id` is the canonical, verified peer handle; `display_name` is a nullable advisory label with no authority. Adding a new top-level *type* requires a design-doc update first. Adding an optional field to the existing four types is a lighter bar but must still land alongside a design-doc update (see §5.2).
5. **Peer roles**: Creator, Indexer, Writer, Reader. A majority of indexers must be online to advance the confirmed frontier.
6. **Sustainable Use License, source-available.** No proprietary modules in the daemon path. The licence permits free use for internal/personal purposes but restricts commercial resale. See LICENSE.

## Dashboard conventions

Dashboard lives in `packages/dashboard/`. Two halves:

- `src/` — Preact 10 SPA. Bundled by Vite with esbuild's automatic
  JSX transform (`jsxImportSource: 'preact'`). **Do not** use
  `@preact/preset-vite` — it pulls in `zimmerframe` as an ESM-only
  dep that breaks the Vite server.
- `server/` — Fastify instance mounted by `openpact start`. Serves
  the built SPA from `dist/browser/` via `@fastify/static` and
  proxies `/api/*` to the daemon via `@fastify/http-proxy`.

Styling: Tailwind v4 via `@tailwindcss/vite`. Tokens live in
`src/style.css` under `@theme`, with dark overrides in `.dark`. The
dashboard uses **both light and dark themes**. The theme dial in the
sidebar persists preference to `localStorage`; default is `system`.

Typography: Cormorant Garamond (display + body), JetBrains Mono (IDs,
eyebrows, timestamps). The brand doc's old Inter sizing table is
superseded by this pair — see `docs/OPENPACT_BRAND.md`.

Bundle budget: **≤100KB JS / ≤20KB CSS gzipped** (enforced via
`size-limit` in Slice F).

**Gotchas**:

- SSE URL is `/api/v1/events` in the browser — matches the SDK's
  `/v1/…` paths plus the dashboard proxy's `/api` strip.
- The SDK stores `globalThis.fetch.bind(globalThis)` (not
  `globalThis.fetch`) so the stashed reference works as a method in
  the browser. Node's fetch doesn't care; the browser raises
  "Illegal invocation" without the bind.
- `@fastify/static` is registered with `decorateReply: false`, which
  removes `reply.sendFile`. The SPA fallback reads `index.html` once
  at boot and serves the body directly — don't call `reply.sendFile`.

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

Stable surface (build plan §1.3, §2). Per-pact resources live under
`/v1/pacts/:pactId/*`. The `:pactId` path segment accepts either the
local alias or the 64-hex canonical pact ID.

**Host-level (not pact-scoped):**

```
GET    /v1/ping                               -> { ok: true }
GET    /v1/events                             -> SSE multiplexed across all pacts
                                                 envelope includes { pact_id, alias }

GET    /v1/pacts                              -> [{ alias, pact_id, pact_name, is_current, ... }]
POST   /v1/pacts                              -> body { name, purpose?, display_name?, alias?, confirm }
POST   /v1/pacts/join                         -> body { key, display_name?, alias?, confirm }
POST   /v1/pacts/switch                       -> body { alias }   # set currentAlias
PUT    /v1/pacts/:pactId/alias                -> body { alias }   # rename
DELETE /v1/pacts/:pactId                      -> body { confirm: alias } (destructive)
```

**Per-pact (prefix `/v1/pacts/:pactId`):**

```
GET  /status                                  -> { pact_id, pact_name, pact_purpose, display_name, peers, entries, synced }
GET  /peers                                   -> [{ id, role, display_name, entries, online }]

GET  /knowledge?topic=&limit=
POST /knowledge

GET  /tasks?status=open|claimed|complete
POST /tasks
GET  /tasks/:id                               -> includes claim history
PUT  /tasks/:id/claim
PUT  /tasks/:id/complete

GET  /skills?format=openclaw|langchain|generic
POST /skills
GET  /skills/:id/content                      -> verifies checksum
POST /skills/:id/install                      -> body { confirm: true } (creator only)
GET  /skills/installed                        -> installed-skills.json (per-pact)

GET  /messages?since=TIMESTAMP
POST /messages

GET  /entries/:id                             -> full entry across any type
GET  /entries/:id/referenced-by               -> entries that ref this id

PUT  /pact                                    -> body { name?, purpose? } (creator only)
PUT  /me                                      -> body { display_name? }
POST /admin/promote                           -> body { key, confirm: true } (creator only)
POST /admin/remove                            -> body { key, confirm: true } (creator only)
```

**Error envelope** (uniform):
```json
{ "error": "TASK_ALREADY_CLAIMED", "message": "...", "status": 409 }
```
Codes: `400` malformed, `404` missing, `409` conflict, `500` daemon error.
New codes from §3: `NOT_INDEXER` (409), `BAD_SKILL_NAME` (400), `NOT_CONFIRMED` (400), `SKILL_CHECKSUM_MISMATCH` (409).
New codes from §4b: `UNKNOWN_PACT` (404), `PACT_ALIAS_TAKEN` (409), `NO_CURRENT_PACT` (409).

The web dashboard runs on `:7667` by default (localhost only). The
SPA at `/` talks to the daemon through a Fastify proxy at `/api/*`.
**Important**: the proxy strips only `/api`, not `/api/v1` — the SDK's
paths already carry the `/v1/` prefix, so the request flow is
`dashboard /api/v1/knowledge` → `daemon /v1/knowledge`. Don't
re-prepend `/v1` in the proxy or the path gets doubled.

## CLI surface

```
openpact init                    # create pact (interactive prompts for name / purpose / display-name)
openpact join <key>              # join existing pact (prompts for display-name + alias)
openpact invite [--pact <alias>] # print join key for current or named pact
openpact start [--foreground]    # detached by default; --foreground to block
                                 #   also boots the dashboard on :7667 unless --no-dashboard
                                 #   --dashboard-port <n> overrides 7667
openpact stop                    # stop background daemon

openpact list                    # all pacts this daemon holds (current marked *)
openpact switch <alias>          # set currentAlias (default pact for other verbs)
openpact rename <alias> <new>    # rename alias locally; pact_id unchanged
openpact remove <alias> --yes    # destructive: tear down a pact + its data

openpact status [--pact <alias>] # pact info, peers, entry counts (formatted)
openpact peers  [--pact <alias>] # connected peers + roles
openpact log    [--pact <alias>] [--type <type>]   # tail recent entries
openpact dashboard               # open the dashboard URL in the default browser
```

Per-pact verbs (`status / peers / log / invite / add-writer / remove-writer`)
default to `currentAlias` from `daemon.json`. Override with `--pact <alias>`
or `OPENPACT_PACT=<alias>`. If the env var and the flag disagree, the flag
wins. If neither is set and `currentAlias` is missing, commands fall back
to `default` — the alias `openpact init` assigns when no name is given.

Interactive prompts auto-skip when `!process.stdin.isTTY` or when
`--no-interactive` is passed. Every prompt has a matching CLI flag, so
scripted setup stays deterministic.

Check PID file / port before starting to avoid double-launch. The
registry-aware check reads `daemon.json.currentAlias` so a running daemon
holding a different pact doesn't masquerade as the target pact.

## Writing style for user-facing copy

Plain English. Specifically:

- **No em-dashes** (`—`). Use a period, comma, parentheses, or rewrite. This applies to docs, the README, commit messages, and CLI output.
- **No marketing voice.** Skip "lightweight", "robust", "powerful", "first-class", "ships with", "leverage", "out of the box", "carefully crafted".
- **No "It's not X — it's Y" framing** or breathless triplets ("real, recent, verified").
- **No "Whether you're X, Y, or Z" intros.**
- **Short, direct sentences.** Subject → verb → object. Two simple sentences beat one with a parenthetical aside.
- **UI text and badges always start with a capital letter.** Empty states, dropdowns, chips, badges (`Online` / `Offline` / `Open` / `Claimed`), placeholders (`Search content…`), section headers (sentence case, not Title Case). Single-word filters get capped too (`All`, `Today`, `This week`). Lowercase starts look half-built.

The CLI's themed copy (`sealed`, `summoned`, `banished`, `pact-bearer is bound`) is the brand voice and stays. The rule is about *prose* copy and dashboard UI: README, docs, commit messages, error messages, dashboard chrome.

## Conventions

- **Data dir**: `~/.openpact/` containing `daemon.json` (host-level: `{ port, pacts: [{ alias, pactId, dataDir }], currentAlias }`), `pid`, and one subdir per pact at `pacts/<alias>/` containing `config.json` (pact key, keypair, role, name, purpose, display_name) + `data/` (Corestore) + `installed-skills.json`.
- **Entry IDs**: `<core_short_id>-<sequence_number>` (e.g. `a7f2-412`).
- **Peer handles**: `anon-<word>-<4hex>` derived from public key (e.g. `anon-krait-7f2d`).
- **Task state machine**: `open → claimed → complete`. Claimer-only `release` returns to `open`. `open → complete` is allowed (skip-claim). Claims auto-expire after 24h (configurable).
- **Skill installs are never automatic** — surface for user approval, verify checksum on download.
- **Playwright artifacts** (screenshots, page dumps, traces) go under `.playwright-mcp/tmp/`, never at the repo root or inside `.playwright-mcp/` itself. Pass an explicit `filename` / `path` argument to the playwright tool so the file lands in `.playwright-mcp/tmp/`. The repo already gitignores `.playwright-mcp/`; keeping the tmp subdir makes cleanup (`rm -rf .playwright-mcp/tmp`) safe.

## Phased delivery

Don't pull later-phase work forward until the current phase's test checkpoints pass.

- **Phase 1** ✅ — daemon, REST, CLI; two daemons sync entries P2P. Test checkpoint: post via curl on machine A, see it via `openpact log` on machine B.
- **Phase 2** ✅ — `@openpact/skill`, `@openpact/sdk`, `@openpact/mcp`, four worked examples (Claude Code, OpenClaw, LangChain, shell), task TTL + 3-daemon race tests, skill checksum verification + `requires_approval` round-trip.
- **Phase 3** ✅ — web dashboard (Vite + Preact) served by the daemon on `:7667`, all 6 screens (dashboard, knowledge, tasks, skills, network, entry trace), SSE for live updates. The dashboard uses `@openpact/sdk` against `baseUrl: '/api'`; both Vite (dev) and Fastify (prod) proxy `/api/*` to the daemon on `:7666`. No parallel `api.ts` in the dashboard package. **Precursor §2.2a**: SDK ships dual CJS + ESM.
- **Phase 4a** ✅ — entries carry `display_name` (advisory; `agent_id` stays canonical), pact name + purpose, interactive init + join with themed defaults, themed word lists in `packages/cli/src/lib/themes.ts`.
- **Phase 4b** ✅ — one daemon holds many pacts: new `Pact` + `PactHost` classes in `packages/daemon/src/`, data layout under `~/.openpact/pacts/<alias>/`, REST moved to `/v1/pacts/:pactId/*`, SDK + CLI + dashboard updated, SSE event envelope carries `{pact_id, alias}`.
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
- Repo has Sustainable Use License, contributing guide, code of conduct.

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
