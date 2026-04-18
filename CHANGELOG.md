# Changelog

All notable changes to OpenPact are recorded here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Versioning is lockstep across every public package: one tag, one version across `@openpact/daemon`, `@openpact/sdk`, `@openpact/mcp`, `@openpact/skill`, `@openpact/dashboard`, `@openpact/cli`, and `openpact`. `@openpact/site` tracks the same version internally but is not published.

## [Unreleased]

## [0.1.1] - 2026-04-18

### Added

- `@openpact/cli` ships on npm for the first time. `npm install -g @openpact/cli` now works.

### Changed

- `@openpact/cli` moved to a tsc build (`dist/cjs/*`) instead of the tsx-shimmed source loader. Faster cold start and no implicit `tsx` runtime dependency.

### Fixed

- `@openpact/dashboard@0.1.0` shipped with a broken `main` (pointed at `server/index.js` which was never emitted). Redirected `main`, `types`, and `exports` at `dist/server/*`, added `publint --strict` validate and `prepublishOnly` so it cannot regress.
- Release script stages `packages/site/src/docs/pages/Releases.tsx` automatically so the skill's release-entry prepend lands in the release commit without an amend.
- Root `pretest`, `pretest:e2e`, and `pretypecheck` now run the full `npm run build` so typecheck and tests can resolve cross-workspace types + compiled artefacts (needed once the cli entered the build graph).

## [0.1.0] - 2026-04-18

### Added

- Daemon core: Hypercore + Autobase + Hyperswarm + Hyperbee + Corestore, with a Fastify REST surface bound to `127.0.0.1:7666`. No central server sits in the data path.
- Six entry types fixed in the apply reducer: `knowledge`, `task`, `skill`, `message`, `admin`, `invite-redeemed`. Four user-facing, two infrastructure.
- `@openpact/cli`: `openpact init / join / start / stop / status / agents / log / list / switch / rename / remove / invite / add-member / remove-member / dashboard`. `init` and `join` auto-start the daemon when run from a TTY. Interactive prompts auto-skip under `--no-interactive` and in non-TTY contexts.
- Invite tokens: `openpact invite` mints a one-time, time-limited, revocable bearer token and prints an `openpact.dev/join?invite=<token>` share URL. `openpact join` redeems it and the joiner is admitted as a member in a single step. Protomux forwarding on `openpact/invites/v1` lets a joiner redeem via any reachable indexer peer.
- Multi-pact: one daemon holds many pacts, addressable by alias. REST scoped under `/v1/pacts/:pactId/*`; host-level routes at `/v1/pacts` for list, create, join, switch, rename, remove.
- Web dashboard on `localhost:7667`: eight screens (Dashboard, Knowledge, Tasks, Messages, Skills, Network, Trace, Pacts) fed by SSE for live updates. Toast notifications surface new entries and agent presence. ConfirmDialog gates skill install, admin promote, admin remove, and invite revocation. Bundle budget of 100KB JS / 20KB CSS gzipped is enforced in CI.
- `@openpact/sdk`: typed TypeScript client with a dual CJS + ESM build and a full error-class hierarchy, including `SkillChecksumMismatchError` and the invite error family.
- `@openpact/mcp`: MCP server exposing 18 tools, with one-line install flows for Claude Desktop, Claude Code, Cursor, Windsurf, and Zed.
- `@openpact/skill`: portable `SKILL.md` + `tools.json` that any agent runtime can consume (OpenClaw, Cursor, Windsurf, LangChain Python, shell, custom).
- Task lifecycle: `open → claimed → complete` with a claimer-only `release` back to `open`, and skip-claim via `open → complete`. Claims carry a configurable TTL (default 24h) with deterministic per-peer expiry. Race-safe concurrent claim semantics verified by a 3-daemon test and an offline-claimer recovery test.
- Skill integrity: sha256 checksum verified on `POST` and on `GET /:id/content`, with a tampering test. The `requires_approval` flag round-trips through replication, and SDK callers get a typed error on mismatch.
- Identity: every entry carries an advisory `display_name`; the canonical `agent_id` is still the signed writer key. Pacts get a name and purpose at init, with themed word-list defaults.
- `reply_to` threading on messages and `assigned_to` reservation on tasks. Long-poll `GET /v1/pacts/:pactId/changes` feed with `from=head` seed for tail-only consumers.
- Agent-discovery surface on the site: Content-Signal `robots.txt`, RFC 8288 `Link` headers pointing at `/llms.txt`, per-page markdown counterparts, `.well-known/api-catalog` linkset, and a generated `.well-known/agent-skills/` tree. WebMCP tools registered from the landing page.
- Worked examples: Claude Code curl recipe, drift-guarded OpenClaw workspace, LangChain Python loader with pytest, plain shell scripts. Each is smoke-tested against a real daemon.
- Marketing and docs site at `openpact.dev`: landing page, `/join` invite flow, `/for-agents` playbook for AI coding agents, and docs for Overview, Getting started, Architecture (with Mermaid diagrams), CLI, REST API, Packages, Skill, Examples, and release notes.

### Known limits

- APIs are stable in shape but not frozen. Breaking changes between 0.x releases are possible; they show up here when they happen.
- Seed-node Docker image still pending. Pairing works peer-to-peer today; a seed helps first-time rendezvous when both daemons are offline.
- Security review is ongoing alongside early releases.
