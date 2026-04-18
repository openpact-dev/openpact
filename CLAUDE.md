# CLAUDE.md

Guidance for Claude Code working in this repo.

## Canonical resources

- **Domain**: `openpact.dev`
- **GitHub**: `github.com/openpact-dev/openpact`
- **npm**: `@openpact/<name>` (e.g. `@openpact/sdk`, `@openpact/daemon`)

## Source of truth

- `docs/OPENPACT_DESIGN.md` — functional design (what / why).
- `docs/OPENPACT_BUILD_PLAN.md` — phased build plan (how). ✅ marks reflect what's shipped.
- `docs/mockups/0*.html` — UI screen mockups.

When asked to implement something, read both docs first. If a request contradicts either, raise it before writing code.

## Repository status

Phases 1, 2, 3, 4a, 4b and production-hardening 1a–5d are all shipped. Next is v0.1.0 tag and first publish.

Run `npm run test:all` on a fresh clone before cutting the release. Details in `docs/OPENPACT_BUILD_PLAN.md` §4 + the production-hardening plan.

## What OpenPact is

A P2P daemon giving software agents (OpenClaw, Claude Code, LangChain, CrewAI, shell scripts, anything that speaks HTTP) a **shared, append-only memory**. Built on the Holepunch/Pear stack:

- **Hypercore** — one signed append-only log per agent
- **Autobase** — deterministic multi-writer merge into a single shared view
- **Hyperswarm + HyperDHT** — peer discovery, NAT traversal, encrypted streams
- **Hyperbee** — sorted KV on top of the view for indexed queries

No central server. Eventually consistent. Tamper-proof. Local REST API on `localhost:7666`.

## Monorepo layout

```
openpact/
  packages/
    daemon/        # Autobase + Hyperswarm + fastify REST on :7666
    cli/           # commander-based openpact <verb>
    sdk/           # @openpact/sdk — typed TS client (dual CJS+ESM)
    mcp/           # @openpact/mcp — MCP server wrapping the daemon
    skill/         # @openpact/skill — portable SKILL.md + tools.json
    dashboard/     # Vite + Preact SPA + Fastify proxy on :7667
    site/          # @openpact/site — static marketing site for openpact.dev
  examples/        # claude-code, openclaw, langchain, shell, seed
  docs/
```

TypeScript + npm workspaces. CommonJS module output (matches the Pear/Hyper stack). All `.ts`, run via `tsx` (no build step for tests). The Hyper stack ships zero `.d.ts`, so ambient `declare module` shims live in `types/hyper-stack.d.ts` and internal bindings are `any`-typed.

## Architectural invariants

Load-bearing. Don't violate without explicit user sign-off.

1. **No central server in the data path.** DHT bootstrap + optional seed nodes for availability only.
2. **REST on `localhost:7666` is the universal integration point.** Bind `127.0.0.1` only. Requests carry `Authorization: Bearer <token>`, minted into `<dataDir>/daemon.json` (mode 0600) on first boot. `Host` must be loopback; `Origin`, if present, must match. SDK/MCP/CLI/examples forward the token automatically.
3. **Autobase `apply` is the single ordering authority.** All entry validation, membership changes, and view shape decisions happen there.
4. **Entry schema is fixed at six types**: `knowledge`, `task`, `skill`, `message`, `admin`, `invite-redeemed`. First four are user-facing; last two are infrastructure entries written only by indexers. Each entry: `{type, timestamp, agent_id, display_name?, payload, refs, ttl}`. `agent_id` is the canonical verified peer handle; `display_name` is advisory with no authority. New top-level types or new optional fields require a design-doc update first.
5. **Peer roles**: Creator, Indexer, Member. A majority of indexers must be online to advance the confirmed frontier.
6. **Invite tokens are the only path to member admission.** One-time, time-limited, bearer token minted by the creator. Single-use is enforced by the `_invites/<nonce>` view key written in apply(). Creator can `openpact remove-member <key>` to banish a bad actor. Replication is gated on active membership, not key-in-view.
7. **Sustainable Use License, source-available.** No proprietary modules in the daemon path. See LICENSE.

## Tech stack

| Concern | Pick |
|---|---|
| Append-only log | `hypercore` |
| Multi-writer merge | `autobase` |
| Peer discovery | `hyperswarm` |
| Core management | `corestore` |
| Indexed view queries | `hyperbee` |
| HTTP server | `fastify` |
| CLI parsing | `commander` |

Don't substitute these without raising it.

## REST API

Stable surface per build plan §1.3, §2. Per-pact resources live under `/v1/pacts/:pactId/*`; `:pactId` accepts either the local alias or the 64-hex canonical pact ID.

Host-level surface (not pact-scoped): `/v1/ping`, `/v1/events` (SSE), `/v1/pacts` (list/create/join/switch/rename/remove), `/v1/healthz`, `/v1/readyz`, `/v1/metrics`.

Paginated list endpoints: query params `order=asc|desc` (default desc), `limit` (1–1000, default 50), `cursor` (opaque). Response is `{ entries: T[], cursor: string | null, has_more: boolean }`. Bare-array endpoints (`/agents`, `/skills/installed`, `/entries/:id/referenced-by`) are unpaginated.

Uniform error envelope: `{ "error": "CODE", "message": "...", "status": 4xx }`. Code list lives next to the code in `packages/{daemon,sdk}/src/error-codes.ts` (sync-checked).

**Dashboard proxy**: SPA on `:7667` talks to the daemon via `/api/*`. The proxy strips only `/api`, not `/api/v1`, so `dashboard /api/v1/knowledge` → `daemon /v1/knowledge`. Don't re-prepend `/v1` or the path doubles.

## CLI surface

Key verbs. Full list + flags in `docs/OPENPACT_BUILD_PLAN.md`.

- Setup: `init`, `join <token>`, `invite`, `start [--foreground]`, `stop`, `dashboard`.
- Multi-pact: `list`, `switch <alias>`, `rename <alias> <new>`, `remove <alias> --yes`.
- Monitoring: `status`, `agents`, `log [--type <type>]`.
- Install: `install claude-code` (writes SessionStart + UserPromptSubmit hooks), `hook <event>` (invoked by Claude Code, not humans).
- Write verbs (terminal users; agents use curl/SDK/MCP): `message`, `record`, `task add|claim|complete|release|list`, `skill install`.

Per-pact verbs default to `currentAlias` from `daemon.json`. Override with `--pact <alias>` or `OPENPACT_PACT=<alias>` (flag wins over env). Interactive prompts auto-skip when `!process.stdin.isTTY` or `--no-interactive`.

## Dashboard conventions

`packages/dashboard/` has two halves:

- `src/` — Preact 10 SPA. Vite + esbuild automatic JSX (`jsxImportSource: 'preact'`). **Do not install `@preact/preset-vite`** — it pulls in `zimmerframe` (ESM-only) which breaks Vite.
- `server/` — Fastify mounted by `openpact start`. Serves built SPA from `dist/browser/` via `@fastify/static` and proxies `/api/*` via `@fastify/http-proxy`.

Styling: Tailwind v4 via `@tailwindcss/vite`. Tokens in `src/style.css` under `@theme` with `.dark` overrides. Theme dial persists to `localStorage`, default `system`.

Typography: Cormorant Garamond (display + body), JetBrains Mono (IDs, eyebrows, timestamps). See `docs/OPENPACT_BRAND.md`.

Bundle budget: **≤100KB JS / ≤20KB CSS gzipped** (enforced via `size-limit`).

Gotchas:

- SSE URL is `/api/v1/events` in the browser.
- The SDK stores `globalThis.fetch.bind(globalThis)` (not raw `globalThis.fetch`) so the browser doesn't raise "Illegal invocation".
- `@fastify/static` is registered with `decorateReply: false`. SPA fallback reads `index.html` once at boot and serves the body directly. Don't call `reply.sendFile`.

## Site conventions

`packages/site/` is a pure static, client-side-only Vite MPA for openpact.dev. No daemon, no SDK dependency. Each route is a real HTML entry in `src/` with a Preact bootstrap under `src/entries/*.tsx`.

The dashboard is the canonical design system: `src/style.css` is copied verbatim from the dashboard and must not drift. Same `@preact/preset-vite` gotcha applies.

Pages: `/` landing, `/docs/<overview|getting-started|cli|rest-api|architecture>/`, `/join/?invite=<token>`, `/for-agents/`. SEO assets in `public/` (`favicon.svg`, `robots.txt`, `sitemap.xml`, `llms.txt`, `og-image.png`).

Invite share URL is `https://openpact.dev/join?invite=<token>`. `openpact invite` on the CLI and dashboard `InviteDialog` both emit it alongside the raw token.

Agent-discovery surface: `robots.txt` declares Content-Signal preferences; `vercel.json` attaches RFC 8288 `Link` headers to `/` pointing at `/llms.txt` via `rel="describedby"` and `rel="alternate"; type="text/markdown"`; markdown counterparts (`/llms.txt`, `/docs.md`, `/docs/<slug>.md`, `/for-agents.md`) are served at their own URLs with correct content-types. Accept-header content negotiation at `/` is not used: Vercel's edge cache (`x-vercel-enable-rewrite-caching`) keys on path only, so header-based rewrites over a static site get sealed to the first-seen variant. Agents discover markdown via the Link header or direct URL. `/.well-known/api-catalog` is a hand-authored RFC 9727 linkset; `/.well-known/agent-skills/index.json` plus `/.well-known/agent-skills/openpact/{SKILL.md,tools.json}` are generated by `scripts/sync-agent-skills.mjs` (runs as `predev`/`prebuild`). The landing page registers WebMCP tools via `src/webmcp.ts`. Edit the source SKILL.md in `packages/skill`, not the copy under `public/.well-known/`.

## Writing style for user-facing copy

Plain English:

- **No em-dashes** (`—`). Period, comma, parentheses, or rewrite. Applies to docs, README, commit messages, CLI output.
- **No marketing voice.** Skip "lightweight", "robust", "powerful", "first-class", "ships with", "leverage", "out of the box", "carefully crafted".
- **No "It's not X — it's Y" framing** or breathless triplets.
- **No "Whether you're X, Y, or Z" intros.**
- **Short, direct sentences.** Subject → verb → object.
- **UI text and badges always start with a capital letter.** Empty states, dropdowns, chips, badges (`Online`, `Offline`, `Open`, `Claimed`), placeholders, section headers (sentence case, not Title Case). Single-word filters too (`All`, `Today`, `This week`).

The CLI's themed copy (`sealed`, `summoned`, `banished`, `pact-bearer is bound`) is the brand voice and stays. The rule is about prose copy and dashboard UI.

## Conventions

- **Data dir**: `~/.openpact/` with `daemon.json` (host-level: `{ port, pacts: [{ alias, pactId, dataDir }], currentAlias }`), `pid`, and one subdir per pact at `pacts/<alias>/` (`config.json`, `data/` Corestore, `installed-skills.json`).
- **Entry IDs**: `<core_short_id>-<sequence_number>` (e.g. `a7f2bcde-412`). 8 hex chars.
- **Peer handles**: `anon-<word>-<8hex>` derived from public key.
- **Task state machine**: `open → claimed → complete`. Claimer-only `release` returns to `open`. `open → complete` is allowed (skip-claim). Claims auto-expire after 24h (configurable).
- **Skill installs are never automatic.** Surface for user approval, verify checksum on download.
- **Playwright artifacts** go under `.playwright-mcp/tmp/`, never at the repo root or directly in `.playwright-mcp/`. Pass an explicit `filename` / `path` to the playwright tool. The repo gitignores `.playwright-mcp/`; the `tmp` subdir makes cleanup (`rm -rf .playwright-mcp/tmp`) safe.

## Working with the Pear/Hyper stack

Invoke the `/pears` skill rather than guessing. Pear ships frequently and flag drift is real.

## Commands

Run from the repo root. Requires Node.js ≥ 22.

| Command                     | What it does                                                  |
| --------------------------- | ------------------------------------------------------------- |
| `npm install`               | Install dev tooling and link workspaces.                      |
| `npm test`                  | Unit + integration tests via `brittle` + `tsx`.               |
| `npm run test:unit`         | Unit tests only.                                              |
| `npm run test:e2e`          | End-to-end CLI tests via `execa` subprocesses.                |
| `npm run test:examples`     | Smoke tests under `examples/*/test/`.                         |
| `npm run test:watch`        | Re-run unit tests on file change.                             |
| `npm run test:coverage`     | Run tests under `c8`. Enforces gates.                         |
| `npm run typecheck`         | `tsc --noEmit` over the whole repo.                           |
| `npm run lint`              | `eslint` (with `typescript-eslint`) + `prettier --check`.     |
| `npm run format`            | `prettier --write` over `packages/`.                          |
| `npm run validate`          | `publint --strict` across all publishable packages.           |

Single test file: `NODE_OPTIONS='--import tsx' npx brittle packages/daemon/test/unit/<file>.test.ts`.

Coverage gates (enforced in CI): global ≥ 80 / 75 lines/branches; `apply.ts` per-file ≥ 95 / 90 (see `scripts/check-apply-coverage.js`).

tsconfig: `module: commonjs`, `strict: true`, `noImplicitAny: false` (Hyper stack is opaque). ESLint flat config (`eslint.config.js`) extended with `typescript-eslint`.

`@openpact/sdk` ships dual CJS + ESM; `@openpact/mcp` is CJS-only. Both rebuild as part of `test:all`.

## New branch for new work

Before the first edit of any task, create a fresh branch from `main`: `git checkout -b <type>/<slug>` (`fix/`, `feat/`, `docs/`, `chore/` — matches the repo's commit convention). Never accumulate edits on `main` or reuse an unrelated feature branch from the previous task. If you realize mid-task that you're still on `main`, switch immediately with `git checkout -b <branch>` — the uncommitted edits carry over.

## No "pre-existing" issues

There are **no** pre-existing issues in this repo that are acceptable to leave alone. If `typecheck`, `lint`, or a test fails, even in a package you weren't touching, even if it was failing on `main` before your change, you fix it as part of the current change. Same for stale docs, dead code, wrong paths, flaky tests. Do not defer, do not mark "out of scope". If the fix would balloon scope, stop and raise it with the user.

## Keep this file current

When new packages, scripts, or invariants land, update this file in the same commit. The Repository status, monorepo layout, and Commands tables drift fastest. Architectural invariants and conventions are load-bearing, change only with explicit user sign-off.

## Shared memory via OpenPact (this machine)

This macbook runs an OpenPact daemon on `127.0.0.1:7666`. It holds a live dev pact that Claude instances working on OpenPact use as shared append-only memory. Treat it as a long-lived notebook every agent reads and writes. If the daemon isn't running, the curl commands below fail with `Connection refused`. Surface that and stop; don't try to start it yourself.

Pact:

- Name: `[DEV] OpenPact`, alias `qr-testing`
- Purpose: development pact for agents working on OpenPact
- This host: `Macbook` (creator). Peers: `Germany VPS`, `Desktop WSL2` (members). `openpact agents` shows live state.

Shell preamble:

```bash
OPENPACT_URL="http://127.0.0.1:7666"
OPENPACT_PACT="qr-testing"
OPENPACT_TOKEN="$(jq -r .apiToken "$HOME/.openpact/daemon.json")"
AUTH=(-H "Authorization: Bearer $OPENPACT_TOKEN")
```

Every pact-scoped request needs the bearer header. `/v1/ping` is the only unauthenticated route.

### Coordinating with other agents

Two jobs, two primitives. Picking the wrong one is the most common mistake:

- **Discovery — "what's already here for me?"** Use the typed list endpoints with filters. `GET /tasks?status=open` + client-side filter on `assigned_to` finds work reserved for you. `GET /messages?agent_id=<handle>&since=<ts>` scopes to one author. `GET /knowledge?topic=<t>` surfaces prior decisions. Answers "what exists right now" in one request.
- **Tailing — "wake me when something new happens."** Use `GET /changes`. The feed is chronological (oldest-first), so start by calling `?from=head` once to get a cursor pinned at HEAD, then loop `?since=<that>&wait=30`. Without `from=head`, a bare call replays the entire pact history — useful for backfill, a footgun for tail consumers.

Don't use `/changes` to look for existing state. If you catch yourself sleep-polling a list endpoint, that's the signal to switch to `/changes` with a cursor.

### When to read

- At the start of a non-trivial task, list recent knowledge filtered by the relevant topic.
- Before proposing a convention or architectural change, check whether one already exists. Don't relitigate settled calls.
- Before claiming a task, look at open tasks so you don't duplicate work.
- Before writing (knowledge / message), check you're not restating what's already on the pact.

### When to write

- After a non-obvious call (tradeoff, workaround, chosen convention), record knowledge with a clear topic. Don't record what the diff shows.
- When you start something others might trip over (long refactor, temporary breakage, rename in flight), broadcast a message.
- When the user asks for work that should persist across sessions, post a task instead of a TODO.

### Recipes

```bash
# Read knowledge on a topic
curl -sf "${AUTH[@]}" "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/knowledge?topic=routing&limit=20" \
  | jq '.entries[] | {id, ts: .timestamp, topic: .payload.topic, content: .payload.content}'

# Record a discovery (content renders as markdown on the dashboard)
curl -sf "${AUTH[@]}" -X POST "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/knowledge" \
  -H "content-type: application/json" \
  -d '{"topic":"routing","content":"..."}'

# Tasks
curl -sf "${AUTH[@]}" "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/tasks?status=open" | jq '.entries[] | {id, title}'
curl -sf "${AUTH[@]}" -X PUT "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/tasks/<id>/claim"
curl -sf "${AUTH[@]}" -X PUT "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/tasks/<id>/complete" \
  -H "content-type: application/json" -d '{"result":"PR #123 merged"}'

# Broadcast a message
curl -sf "${AUTH[@]}" -X POST "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/messages" \
  -H "content-type: application/json" -d '{"content":"Starting refactor; expect churn."}'

# Reply to a message (threaded under the parent)
curl -sf "${AUTH[@]}" -X POST "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/messages" \
  -H "content-type: application/json" -d '{"content":"Ack, on it.","reply_to":"<parent-id>"}'
# Read the thread
curl -sf "${AUTH[@]}" "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/entries/<parent-id>/referenced-by"

# Reserve a task for one peer (others can't claim)
curl -sf "${AUTH[@]}" -X POST "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/tasks" \
  -H "content-type: application/json" \
  -d '{"title":"Review the migration PR","assigned_to":"anon-rat-12345678"}'

# Tail new activity without replaying history (seed at HEAD, then long-poll)
CURSOR=$(curl -sf "${AUTH[@]}" "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/changes?from=head" | jq -r .cursor)
while :; do
  R=$(curl -sf --max-time 35 "${AUTH[@]}" "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/changes?since=$(printf %s "$CURSOR" | jq -sRr @uri)&wait=30") || { sleep 2; continue; }
  jq -r '.entries[] | "\(.timestamp)\t\(.type)\t\(.id)\t\(.display_name // .agent_id)"' <<<"$R"
  NEXT=$(jq -r '.cursor // empty' <<<"$R"); [[ -n "$NEXT" ]] && CURSOR="$NEXT"
done
```

HTTP 409 with `error: "TASK_NOT_OPEN"` means another agent owns it. Pick a different task. `NOT_ASSIGNEE` means the task is reserved for someone else.

Check the daemon before assuming it's up: `curl -sf "$OPENPACT_URL/v1/ping"` → `{"ok":true}`.

### Conventions

- Topics are short and reusable: `routing`, `auth`, `db-schema`, `testing`, `dashboard`, `site`. Pick from existing before inventing:
  ```bash
  curl -sf "${AUTH[@]}" "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/knowledge" \
    | jq -r '.entries[].payload.topic' | sort -u
  ```
- One fact per entry.
- Write in **markdown**. Knowledge, message, and skill-description bodies render as GFM markdown on the dashboard (headings, lists, code blocks, links, tables, blockquotes). Use it when it helps; plain prose is fine when it doesn't.
- Don't echo the diff. Record knowledge that isn't already in code or git history.
- Never auto-approve destructive actions. `add-member`, `remove-member`, skill install, admin promote/remove all need user sign-off.
