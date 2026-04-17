# OpenPact: Build Plan

> Reference: OPENPACT_DESIGN.md for full functional spec.
> Stack: TypeScript on Node.js, Hypercore, Autobase, Hyperswarm, HyperDHT
> Tests run via `tsx` (no build step in dev/CI); typecheck via `tsc --noEmit`.
> Licence: Sustainable Use License (SUL)

---

## Language and tooling

**TypeScript by default.** All source and tests are `.ts`, run via `tsx` in
dev and CI (`NODE_OPTIONS='--import tsx' brittle ...`) — no build step for
the inner loop. A `tsc --noEmit` typecheck runs in CI alongside lint and
coverage. Publishable packages (SDK in Phase 2; daemon + CLI in Phase 4)
emit precompiled CJS + ESM + `.d.ts` via `tsc` at publish time.

Why TS:

- The parts of the daemon we own (entry schemas, apply nodes/views/hosts,
  config, peer handles, REST routes, SDK surface) benefit from compile-time
  types — both for our own correctness and for downstream consumers of the
  SDK.
- Tradeoff: the **Holepunch stack ships zero `.d.ts`** (Hypercore, Autobase,
  Hyperswarm, Corestore, Hyperbee, HyperDHT, b4a). We declare them as
  ambient `any` in `types/hyper-stack.d.ts` and accept that integration
  code with the stack is dynamically typed. This is fine — the
  trust-critical layer is the ajv validation step, which is runtime-checked.
- `noImplicitAny: false` in `tsconfig.json` so the `any` boundaries with
  the Hyper stack don't require explicit annotation. Everything we own
  is typed properly.

When writing new modules, type the public API and your own data shapes;
let `any` flow through the Hyper stack interactions where they would
otherwise force ceremony.

---

## Testing framework

Testing is a first-class concern, set up in Phase 1.1 and used in every step thereafter. **No PR merges without tests covering the change.** The DoD for every step below includes "tests pass + coverage targets met."

### Runner: `brittle`

We use [`brittle`](https://github.com/holepunchto/brittle) as the test runner. Rationale:

- It's the runner used by every package we depend on (Hypercore, Autobase, Hyperswarm, Corestore, Hyperbee). Contributors familiar with the Holepunch stack already know it.
- TAP output, parallel execution, async-first, native `teardown(fn)` — well-suited to the start-stop-replicate patterns we'll be testing.
- Tiny dependency surface, matching the project's lightweight philosophy.

```typescript
import test from 'brittle'

test('apply rejects unknown entry type', async (t) => {
  const { daemon } = await tmpDaemon(t)
  await t.exception(() => daemon.append({ type: 'bogus' }))
})
```

### Supporting tooling

| Tool | Purpose |
|---|---|
| `brittle` | Test runner |
| `c8` | Coverage reporting (V8-native, no Babel) |
| `hyperswarm/testnet` | In-memory swarm for integration tests (no real DHT) |
| `fastify.inject()` | In-process HTTP request injection for API tests (no real port bind) |
| `execa` | CLI invocation in subprocess for end-to-end tests |
| `playwright` | Dashboard UI tests (Phase 3 only) |
| `eslint` + `prettier` | Lint + format (run in CI, fail on diff) |

### Test layout

Tests live alongside the code they test:

```
packages/
  daemon/
    src/
    test/
      unit/
        apply.test.ts
        validation.test.ts
        ...
      integration/
        replication.test.ts
        ...
      helpers/
        tmp-daemon.ts    # spawn daemon in temp dir, register teardown
        pair.ts          # two paired daemons, returns { a, b }
        swarm.ts         # N-daemon mesh on hyperswarm testnet
```

### Test categories

| Category | Scope | Examples |
|---|---|---|
| **Unit** | A single module, no I/O. | `apply()` accepts/rejects entries; entry-ID encoding; peer-handle derivation. |
| **Integration** | Multi-component within one process, real Corestore + testnet swarm. | Two daemons sync entries; concurrent task claims resolve via merge order; writer added by indexer propagates. |
| **End-to-end** | Subprocess CLI, real ports, real fastify, isolated `~/.openpact/` dirs. | `openpact init` + `start` + curl POST + `openpact log` on a second instance. |
| **UI** (Phase 3) | Playwright against the web dashboard served on `:7667`. | Dashboard renders peer count; clicking task card opens detail. |

### Fixtures

A small set of helpers under `packages/*/test/helpers/` does the heavy lifting:

```typescript
// helpers/tmp-daemon.ts
import test from 'brittle'
import os from 'os'
import path from 'path'
import fs from 'fs/promises'
import { Daemon, type DaemonOpts, type JoinOpts } from '../../src/daemon'

export async function tmpDaemon(t: any, opts: DaemonOpts & { joinKey?: string } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openpact-'))
  const daemon = opts.joinKey
    ? await Daemon.join({ dataDir: dir, ...(opts as JoinOpts) })
    : await Daemon.create({ dataDir: dir, ...opts })
  await daemon.start()
  t.teardown(async () => {
    await daemon.stop()
    await fs.rm(dir, { recursive: true, force: true })
  })
  return { daemon, dir }
}

// helpers/pair.ts — two daemons in the same pact, swarm via testnet
import createTestnet from 'hyperdht/testnet'

export async function pair(t: any) {
  const testnet = await createTestnet(3, t.teardown)
  const swarm = { bootstrap: testnet.bootstrap }
  const a = await tmpDaemon(t, { swarm })
  const b = await tmpDaemon(t, { swarm, joinKey: a.daemon.pactKey! })
  await a.daemon.waitForConnections(1)
  await b.daemon.waitForConnections(1)
  return { a, b }
}
```

Tests **always** use `t.teardown` for cleanup. Leaks (open handles, lingering swarms) fail CI.

### Coverage targets

Enforced in CI via `c8 --check-coverage`:

| Package | Lines | Branches |
|---|---|---|
| `daemon` | 80% | 75% |
| `cli` | 70% | 65% |
| `sdk` | 90% | 85% |
| `dashboard` (Phase 3, server) | 80% | 75% |

The `apply` function has a hard floor of **95% lines / 90% branches** — it's the trust-critical path.

### CI

GitHub Actions matrix:

- Node `20.x`, `22.x`
- OS `ubuntu-latest`, `macos-latest`
- Steps: `npm ci` → `npm run lint` → `npm run typecheck` → `npm run test:coverage` → upload to Codecov
- A separate `e2e` job runs the subprocess CLI tests on `ubuntu-latest` only
- A separate `integration-network` job exercises real Hyperswarm (no testnet) on `ubuntu-latest`, allowed to flake but logged

### Conventions

- Test files: `*.test.ts`, located under `packages/*/test/<category>/`. Run via `tsx` (`NODE_OPTIONS='--import tsx' brittle ...`)
- Helpers: `packages/*/test/helpers/`
- Each test file is **self-contained** — no shared state between tests
- Use `t.teardown` for every resource (daemons, swarms, temp dirs)
- Assert error codes/messages explicitly, not just "throws"
- Property-based tests via `fast-check` are encouraged for parsers (entry IDs, peer handles, schema validation)
- Tests should run in **under 30 seconds for unit + integration** locally; e2e budget is 2 minutes

---

## Phase 1: Core daemon + CLI

**Goal:** A working daemon that two machines can run, connect to each other, and share entries over P2P. Every component is covered by tests from day one.

**Duration:** ~2 weeks (revised: +2 days for test scaffolding)

### 1.1 Project setup ✅ (commit `17add43`)

- [x] Initialise monorepo structure:
  ```
  openpact/
    packages/
      daemon/
      cli/
    examples/
    docs/
    LICENSE (Sustainable Use License)
    README.md
    package.json (workspace root)
  ```
- [x] Set up npm workspaces
- [x] Add `.gitignore`, `.prettierrc`, `eslint.config.js` (see deviation below)
- [x] Write initial `README.md` with one-liner, what it does, and "coming soon" install instructions
- [x] **Test scaffolding:**
  - [x] Add devDeps to root: `brittle`, `c8`, `eslint`, `@eslint/js`, `globals`, `prettier`, `execa`, `fast-check`
  - [x] Root scripts (test, test:unit, test:e2e, test:watch, test:coverage, lint, format) — see deviation below
  - [x] Add `c8` config to root `package.json` (thresholds defined but not yet enforced — see deviation)
  - [x] Create `.github/workflows/ci.yml` with the matrix described in Testing framework
  - [x] Add a placeholder smoke test (`packages/daemon/test/unit/smoke.test.ts` — originally `.js`, converted post-1.2) that asserts `1 + 1 === 2` so CI is green from day one

**Deviations from the original plan, accepted during 1.1:**

1. **ESLint flat config (`eslint.config.js`)** instead of legacy `.eslintrc`.
   ESLint 9 ships flat config as the default; the legacy format is being
   phased out. Required adding `@eslint/js` and `globals` to devDeps.
2. **`c8 --check-coverage` is off in 1.1** because the empty packages would
   trip any non-zero threshold. The `test:coverage` script reports but does
   not gate. Re-enable in 1.2 once `apply.ts` and friends exist; configure
   per-package thresholds at that point.
3. **e2e CI step is wrapped in `|| echo "no e2e tests yet"`** because brittle
   errors when its glob matches no files. TODO comment in `ci.yml` reminds
   to drop this fallback in 1.4 when real e2e tests land.
4. **Added `packages/openpact/` placeholder package** (not in original plan)
   to reserve the unscoped `openpact` name on npm. Publishes a tiny CLI stub
   that points users to `@openpact/cli`. At v0.1.0, decide whether to flip
   the canonical install to `npm i -g openpact` (meta-package depending on
   daemon+cli) or keep it pointing to `@openpact/cli`. **Requires manual
   `npm publish` from `packages/openpact/`** — not automated in CI.

### 1.2 Daemon core ✅ (commit `e4eb807`)

This is the heart of the project. Get this right before touching anything else.

- [x] Install dependencies: `hypercore`, `autobase`, `hyperswarm`, `corestore`, `hyperbee` (also `ajv`, `ajv-formats`, `b4a`; `hyperdht` as devDep for testnet)
- [x] Create `Daemon` class that:
  - Initialises a `Corestore` at a configurable data directory (default `~/.openpact/`)
  - Creates or loads an `Autobase` instance with a bootstrap key
  - Joins the Hyperswarm topic derived from the pact's discovery key
  - Handles peer connections and replication
- [x] Implement the `apply` function for Autobase:
  - Validate incoming entries against the schema (type, timestamp, agent_id, payload)
  - Append valid entries to the view
  - Handle `admin` entries for writer management (`addWriter`, `removeWriter`)
- [x] Implement entry types with JSON schema validation (use `ajv`):
  - `knowledge` (topic, content, confidence, source)
  - `task` (title, status, claimed_by, description, result)
  - `skill` (name, version, description, format, content, checksum)
  - `message` (to, content, priority)
- [x] Write the Hyperswarm connection handler:
  - On new connection, replicate the Autobase
  - Track connected peers with their public keys
  - Emit events for peer-add, peer-remove, sync-complete
- [x] Persist daemon state (keypair, pact key, role) to `~/.openpact/config.json`

#### 1.2 Tests

- [x] **Unit** (`packages/daemon/test/unit/`):
  - [x] `validation.test.ts` — every entry type: valid sample passes; each field omission rejects; type coercion attempts rejected; oversize payload (>64KB) rejected
  - [x] `apply.test.ts` — accepts valid entry; rejects malformed; `admin` `addWriter` calls `host.addWriter`; `admin` from non-indexer is ignored; entry ordering by timestamp+core
  - [x] `entry-id.test.ts` — round-trip encode/decode; collision unlikely (property test with `fast-check`)
  - [x] `peer-handle.test.ts` — derived deterministically from public key; matches `anon-<word>-<8hex>` regex
  - [x] `config.test.ts` — load/save `~/.openpact/config.json`; missing file → defaults; corrupted file → clear error
- [x] **Integration** (`packages/daemon/test/integration/`):
  - [x] `replication.test.ts` — `pair()` fixture; A appends knowledge, B's view contains it within timeout
  - [x] `add-writer.test.ts` — creator promotes B; B's appends propagate to A
  - [x] `reconnect.test.ts` — A goes offline, B appends, A comes back, A catches up
  - [x] `concurrent-writes.test.ts` — A and B both append; both views converge to the same order
  - [x] (bonus) `single-daemon.test.ts` — Daemon.create / load / append / append-on-non-writer
- [x] **Coverage gate**: daemon ≥80% lines / 75% branches; `apply` ≥95% lines / 90% branches
  - Achieved: daemon-wide 92.33% lines / 88.38% branches; `apply.ts` 100% / 100%
  - Per-file `apply.ts` floor enforced via `scripts/check-apply-coverage.js`

**Test checkpoint:** `npm test` green (80 tests, 143 asserts). Two instances on the same machine (different data dirs) connect via in-memory testnet, one appends an entry, the other sees it in the view (covered by `replication.test.ts`).

**Deviations from the original plan, accepted during 1.2:**

1. **`hyperdht/testnet`, not `hyperswarm/testnet`.** The in-memory DHT helper
   lives in `hyperdht`. Added `hyperdht` ^6.30.0 as a devDep.
2. **Indexer status tracked in the view itself** (`_indexers/<hex>` prefix in
   the Hyperbee). Autobase's host API has no `isIndexer(key)` for arbitrary
   writers, so apply maintains its own deterministic indexer set. The first
   writer to produce a valid entry on an empty pact is bootstrapped as the
   implicit creator-indexer.
3. **`b4a` added** as a runtime dep (used everywhere the Hyper stack passes
   Buffers; native to the ecosystem).
4. **`Daemon` exposes three factories** instead of an overloaded constructor:
   `Daemon.create()` (new pact), `Daemon.join({ joinKey })` (join existing),
   `Daemon.load()` (resume from disk).
5. **`viewVersion` includes internal `_indexers/` entries.** Tests use a
   `waitForKnowledge`/`waitForCount` polling helper rather than counting on
   `viewVersion` for user-facing entries. To be revisited if a public
   `userEntryCount` accessor proves useful in 1.3.
6. **TypeScript everywhere** (added post-1.2). All `.js` source and tests
   converted to `.ts`; tests run via `tsx` (`NODE_OPTIONS='--import tsx'
   brittle ...`); typecheck step (`npm run typecheck` → `tsc --noEmit`) runs
   in CI alongside lint and coverage. The Holepunch stack ships no `.d.ts`,
   so `types/hyper-stack.d.ts` declares each module as ambient `any`. The
   build plan's original "Node.js + JS" assumption no longer holds —
   subsequent phases write TypeScript by default.

### 1.3 REST API ✅ (commit `8455243`)

> **Post-Phase 4b note:** every per-pact route listed below now lives
> under `/v1/pacts/:pactId/*`. Host-level endpoints (`/v1/ping`,
> `/v1/events`, `/v1/pacts/*`) keep the bare `/v1/` prefix. The route
> list in this section reflects the Phase 1 shape; see §4b.2 or
> `CLAUDE.md` §REST API contract for the current surface.


- [x] Add `fastify` ^5.8.5 as the HTTP server
- [x] Bind to `127.0.0.1:7666` only (`bind()` helper accepts `127.0.0.1` /
  `::1` / `localhost`; refuses everything else)
- [x] Implement endpoints:
  ```
  GET  /v1/ping                                -> { ok: true }
  GET  /v1/status                              -> { pact_id, peer_handle, role, public_key, agents, entries, is_member, is_indexer, synced }
  GET  /v1/agents                              -> [{ id, remote_key, role, display_name, online, is_self }]  (self first)
  GET  /v1/knowledge?topic=X&limit=N           -> [entries]
  POST /v1/knowledge                           -> KnowledgeEntry   (the created entry; caller can read it without a follow-up GET)
  GET  /v1/tasks?status=open|claimed|complete  -> [reduced TaskState]
  POST /v1/tasks                               -> TaskState        (the created open task)
  GET  /v1/tasks/:id                           -> TaskState        (404 if unknown)
  PUT  /v1/tasks/:id/claim                     -> TaskState        (409 if not open)
  PUT  /v1/tasks/:id/complete                  -> TaskState        (409 if not claimer or already complete)
  PUT  /v1/tasks/:id/release                   -> TaskState        (409 if not claimer or not claimed)
  GET  /v1/skills?format=X                     -> [entries]
  POST /v1/skills                              -> SkillEntry       (the created entry)
  GET  /v1/skills/:id/content                  -> { id, name, version, format, checksum, content }
  GET  /v1/messages?since=TS                   -> [entries]
  POST /v1/messages                            -> MessageEntry     (body { content, priority? }; pact-wide broadcast)
  GET  /v1/changes?since=&wait=&type=&limit=   -> { entries, cursor, has_more } (cross-type long-poll change feed for agent coordination)
  ```
- [x] Request validation via Fastify per-route JSON Schema (rejects with 400 `BAD_REQUEST`)
- [x] Uniform error envelope `{error, message, status}` via `setErrorHandler`
  + `setNotFoundHandler` (so unknown routes also return the envelope)

#### 1.3 Tests

- [x] **Unit** (`packages/daemon/test/unit/api/`) — use `fastify.inject()`, no real port:
  - [x] `ping.test.ts` — returns `{ ok: true }`
  - [x] `status.test.ts` — shape; reflects entry counts after appends
  - [x] `agents.test.ts` — empty initially (no real swarm in unit tests)
  - [x] `knowledge.test.ts` — POST happy path; missing topic → 400; query filter by topic + limit
  - [x] `tasks.test.ts` — full state machine (open→claimed→complete, claimer-only release, double-claim → 409, skip-claim allowed, 404 cases)
  - [x] `tasks-state.test.ts` — pure reducer: race resolution, claimer-only transitions, deterministic order
  - [x] `skills.test.ts` — POST with each format; checksum required; `GET /:id/content` returns content with 404 on unknown
  - [x] `messages.test.ts` — `since` filter; broadcast send; rejects unknown payload fields (no per-recipient addressing)
  - [x] `errors.test.ts` — every error code returns the correct envelope shape
  - [x] `bind.test.ts` — refuses non-localhost; accepts 127.0.0.1 / localhost
- [x] **Integration** (`packages/daemon/test/integration/api/`):
  - [x] `cross-daemon-api.test.ts` — `pair()`; POST knowledge to A's API; GET knowledge on B's API returns it (also: status entries reflect cross-daemon writes)
  - [x] `task-race.test.ts` — two daemons concurrently claim same task; eventual single winner; both daemons agree; subsequent claim returns 409
- [x] **Coverage gate**: API routes ≥ 85% lines
  - Achieved: API routes 92.81% lines / 85% branches; api folder overall 98.58% / 85%; daemon-wide 95.84 / 83.78; apply.ts 100 / 90.48

**Test checkpoint:** All API tests green (139 tests, 269 asserts). Manual sanity: write a tiny `examples/` script that spins up createApi(daemon) + bind() and curl `localhost:7666/v1/{ping,status,knowledge}` works. (Formal e2e CLI tests land in 1.4.)

**Deviations from the original plan, accepted during 1.3:**

1. **`PUT /v1/tasks/:id/release` added** alongside claim/complete — the
   build plan listed it in the conventions but not the route table.
2. **`GET /v1/skills/:id/content` added** to the route list — the build
   plan tests reference it but the original route table omitted it.
3. **Optimistic claim semantics, not strict 409 on race**. The build plan
   §1.3 lists "double-claim → 409" as a unit test (works for sequential
   double-claim from the same peer). For concurrent races *across* peers,
   both 200s can be returned transiently — the loser's claim becomes a
   no-op once the deterministic reducer (lex-earliest entry-id wins)
   reconciles. Both peers eventually agree on the same claimer, and any
   subsequent claim attempt returns 409 `TASK_NOT_OPEN`. This matches the
   build plan's `task-race.test.ts` description ("the loser sees 409 after
   sync").
4. **`Daemon.append` now returns `{ id, timestamp }`** instead of just
   `{ timestamp }`, so POST routes can echo the entry ID. Required
   aligning the seq convention between `daemon.append` (uses post-append
   `local.length`) and `apply` (uses `node.length`, which Autobase sets to
   writer-length-after-this-block, == seq+1 in the index sense). Both now
   produce the same entry-id deterministically.
5. **`daemon._internalView` renamed to `daemon.view`** as a real public
   API now that the REST layer needs it.
6. **`fastify@^5`** (current latest) — ESM/CJS hybrid, no issues with our
   tsx + commonjs setup.

### 1.4 CLI ✅ (commit `9b66c9d`)

> **Post-Phase 4b note:** the CLI surface has grown to include
> `list / switch / rename / remove` and a `--pact <alias>` flag on
> every per-pact verb. See §4b.4 or `CLAUDE.md` §CLI surface for the
> current shape.


- [x] Add `commander` ^14 + `picocolors` for the CLI
- [x] Implement commands:
  ```
  openpact init                -> Create a new pact (keypair + Autobase)
  openpact join <key>          -> Join an existing pact
  openpact invite              -> Print the join key for this pact
  openpact start               -> Start the daemon in the background (default)
  openpact start --foreground  -> Start in the foreground (do not detach)
  openpact stop                -> Stop the background daemon
  openpact status              -> Print pact info, agents, entry counts
  openpact agents              -> List connected agents with roles
  openpact log                 -> Print recent entries (tail style)
  openpact log --type knowledge -> Filter by type
  ```
- [x] `openpact status` formats output with colours and aligned labels
- [x] `openpact init` prints clear next steps
- [x] Handle daemon-already-running via PID file (`pidFileLooksAlive` checks
  `process.kill(pid, 0)`); double-start refused with clear error
- [x] **(beyond plan)** `--data-dir <path>` global flag + `OPENPACT_DATA_DIR`
  env var for isolated test runs and multiple pacts on one host
- [x] **(beyond plan)** `--port <n>` flag on `start / status / agents / log` for
  non-default port (also allows running multiple daemons on one host)
- [x] **(beyond plan)** Hidden `start-foreground` subcommand — used by the
  detached path so we can spawn ourselves cleanly

#### 1.4 Tests

- [x] **Unit** (`packages/cli/test/unit/`):
  - [x] `args.test.ts` — every verb is registered; --data-dir is global; start/log carry expected flags; start-foreground is hidden from help
  - [x] `format.test.ts` — formatStatus / formatAgents / formatLogLine for each entry type; colour codes asserted by stripping them
  - [x] `pid.test.ts` — write/read round-trip; stale PID detected; missing file → null
  - [x] `commands.test.ts` — in-process tests for init / join / invite / stop (the commands that don't need a running daemon)
- [x] **End-to-end** (`packages/cli/test/e2e/`) — `execa` with isolated tmp dirs:
  - [x] `init-flow.test.ts` — `init` writes config; second `init` refuses without `--force`; `--force` works
  - [x] `invite-join.test.ts` — `init` then `invite` prints key; `join <key>` writes B's config; bad hex rejected
  - [x] `start-stop.test.ts` — `start` writes PID and the process is alive (default is detached); `stop` removes PID and kills the daemon cleanly
  - [x] `double-start.test.ts` — second `start` while one is running errors with "already running"
  - [x] `log-tail.test.ts` — POST via fetch, `openpact log` prints it; `--type` filter works; "daemon not running" surfaces clearly
  - [x] `full-flow.test.ts` — two daemons on different ports, full lifecycle through the CLI (init → start → status → POST → log → stop)
- [x] **Coverage gate**: cli ≥ 70% lines / 65% branches
  - Achieved: cli/src 98.9 / 76.47, cli/src/commands 94.75 / 70.85,
    cli/src/lib 93.47 / 78.62; aggregate 96.38 / 80.55. apply.ts 100 / 90.48.

**Test checkpoint:** `npm test` (175 tests) + `npm run test:e2e` (15 tests) green. `full-flow.test.ts` is the codified two-daemon-on-one-host demo.

**Deviations from the original plan, accepted during 1.4:**

1. **Bin shim is JS** (`bin/openpact.js`) that registers `tsx/cjs` and loads
   `src/bin.ts`. The one piece of `.js` we ship in this package — Phase 4
   replaces it with a `tsc`-built `dist/` entry alongside the SDK build.
2. **`execa` pinned to ^8** (CommonJS-friendly). Execa 9 is ESM-only and
   conflicts with our `tsx/cjs` loader.
3. **Daemon root index now exports `createApi` / `bind` / `HttpError` /
   `DEFAULT_PORT`** — they were missing from `@openpact/daemon`'s root
   exports; the CLI's `start` command needs them. Caught by the very
   first manual smoke (`node bin/openpact.js start --daemon` failed with
   `createApi is not a function`).
4. **`api-client` handles Node fetch's `cause` chain** — `ECONNREFUSED`
   arrives wrapped as `TypeError('fetch failed')` with the real error on
   `.cause`. The "daemon not running" detection unwraps it.
5. **`api-client.list(type)` maps singular→plural** (`task` → `/v1/tasks`,
   etc.) — the REST routes are mostly plural, but `knowledge` stays
   singular. CLI uses singular type names internally for consistency with
   the `--type` flag.
6. **Combined-coverage script (`test:all` + `test:coverage`)** — c8 now
   wraps `npm run test:all` (unit + integration + e2e) so subprocess
   coverage from spawned CLI / daemon processes accumulates via
   `NODE_V8_COVERAGE`. Without this, e2e-only paths in
   `commands/{start,stop,status,agents,log}.ts` showed near-zero coverage
   even though they were exercised end-to-end.
7. **`.github/workflows/ci.yml` e2e fallback removed** — the `|| echo "no
   e2e tests yet"` from Phase 1.1 is gone now that real e2e tests exist.

### 1.5 Phase 1 deliverables ✅ (commit `eaa4ab1`)

- [x] Working daemon with P2P sync (1.2)
- [x] REST API on localhost (1.3)
- [x] CLI for setup and monitoring (1.4)
- [x] Basic README with install and quickstart (`496d5ea` + this slice's two-daemon demo)
- [x] **Tests**:
  - [x] ≥40 unit tests across daemon + cli (181 unit/integration)
  - [x] ≥8 integration tests covering replication, writer changes, concurrent writes, API cross-daemon, task races (all shipped in 1.2 + 1.3)
  - [x] ≥6 e2e CLI tests including `full-flow.test.ts` (15 e2e tests; full-flow now genuinely pairs two daemons)
  - [x] Coverage gates met: daemon 95.84/83.78, cli/src 99.04/76.47, cli/src/commands 89.07/68.89, `apply.ts` 100/90.48
  - [x] CI green on Node 20 + 22 × Ubuntu + macOS (verified via `gh run list`)

**Spirit-of-§1.5 additions in this slice:**

1. **`--bootstrap <list>` flag + `OPENPACT_BOOTSTRAP` env var** on `start`
   so the CLI can join a private DHT (e.g. `hyperdht/testnet` for tests).
   `lib/bootstrap.ts` parses `host:port,host:port`. Used by the new
   `full-flow.test.ts` to spin up an in-memory testnet for the two CLI
   daemons — no public-DHT dependency, ~4s test runtime.
2. **`POST /v1/admin/writers` + `DELETE /v1/admin/writers/:key`** REST
   endpoints — wires through `Daemon.addWriter` / `removeWriter` so admin
   entries can be issued from outside the daemon process.
3. **`openpact add-writer <hex-key> [--indexer]` and `openpact
   remove-writer <hex-key>`** CLI commands — the missing piece that lets
   the creator promote a joiner to writer/indexer through the CLI.
4. **`full-flow.test.ts` now genuinely pairs two daemons**: A.init → start
   → invite, B.join → start (same testnet bootstrap), A.add-writer(B), B
   posts knowledge via REST, A sees it via `openpact log`. The
   build-plan-promised demo through the CLI.
5. **README quickstart now has a "Two daemons sharing a pact" section**
   with a runnable bash recipe matching the e2e test.

**Out of scope (deliberately deferred):**

- `CONTRIBUTING.md` + `CODE_OF_CONDUCT.md` — Phase 4 deliverables (DoD
  for v0.1.0)
- Cross-machine real-DHT integration test — Phase 4 `integration-network`
  CI job
- `seed-node` Docker image — Phase 4.2

---

## Phase 2: Agent integrations

**Goal:** Real agents can connect and use the shared memory. OpenClaw skill works. SDK exists for JS agents. Examples for other frameworks. Every integration ships with tests.

**Duration:** ~2 weeks

### 2.1 Generic agent skill ✅

A portable instructions package any LLM-driven agent runtime can load to learn how to use OpenPact. Ships as `@openpact/skill` (path `packages/skill/`). For runtimes that consume markdown rules files (OpenClaw, Cursor, Windsurf) the canonical `SKILL.md` (markdown + YAML frontmatter) is the install. For runtimes that codegen tools (LangChain, CrewAI, AutoGen, custom) the same surface is mirrored in `tools.json`. For MCP-speaking clients use `@openpact/mcp` instead.

- [x] Create `packages/skill/` with `SKILL.md` + `tools.json` (no
  build step — the package ships markdown + JSON files and a README)
- [x] `SKILL.md`: YAML frontmatter listing every tool (name,
  description, method, path, query/body/params shape) plus a
  markdown body explaining when to read, when to write, and the
  topic + one-fact-per-entry conventions
- [x] `tools.json`: machine-readable mirror of the same tool surface
  for programmatic consumers, plus the documented error envelope and
  full code list
- [x] Each tool maps directly to a daemon REST endpoint (no SDK
  runtime dep — works everywhere fetch/curl works)
- [x] README install snippets per runtime:
  - OpenClaw: `openclaw skill install node_modules/@openpact/skill/SKILL.md`
  - Cursor / Windsurf: drop `SKILL.md` into the rules dir
  - Claude Code: link to the curl recipe in `examples/claude-code/`
  - LangChain (Python): code sketch that loads `tools.json` and
    builds `StructuredTool` instances at boot

#### 2.1 Tests

- [x] **Integration** (`packages/skill/test/integration/`):
  - [x] `tools-shape.test.ts` — every tool has name, ≥20-char
    description, valid HTTP method, `/v1/`-prefixed path; tool names
    are unique; runtime env + base URL match the project default;
    every documented daemon error code is listed
  - [x] `tools-shape.test.ts` (drift guard) — every tool name in
    `tools.json` also appears in `SKILL.md`'s frontmatter; SKILL.md
    has the YAML frontmatter delimiters; SKILL.md mentions
    `OPENPACT_URL` + the canonical base URL
  - [x] `against-daemon.test.ts` — boots a real daemon, walks every
    non-destructive tool in `tools.json`, asserts each endpoint
    returns 200 (or a documented 409); also asserts the lost-claim
    race surfaces the documented `TASK_NOT_OPEN` envelope code
- [ ] **Smoke** (manual, documented in README): a real agent runtime
  (OpenClaw, Cursor, LangChain) reads from and writes to the pact
  during normal operation. Recorded as a checkbox in the PR template.

**Test checkpoint:** Integration tests pass. Manual agent smoke logged in PR for at least one runtime.

### 2.2 SDK (TypeScript) ✅

- [x] Create `packages/sdk/` as `@openpact/sdk` — written in TS
- [x] Simple client class:
  ```typescript
  import { OpenPact } from '@openpact/sdk'

  const pact = new OpenPact({ port: 7666 })

  // Read
  const knowledge = await pact.knowledge.list({ topic: 'sales', limit: 10 })
  const tasks = await pact.tasks.list({ status: 'open' })
  const skills = await pact.skills.list()

  // Write
  await pact.knowledge.create({ topic: 'sales', content: '...', confidence: 0.8 })
  await pact.tasks.create({ title: 'Build landing page', description: '...' })
  await pact.tasks.claim(taskId)
  await pact.tasks.complete(taskId, { result: 'Done. PR #42 merged.' })

  // Messages
  await pact.messages.send({ content: 'API endpoint changed' })
  const messages = await pact.messages.since(timestamp)

  // Status
  const status = await pact.status()
  const agents = await pact.agents()
  ```
- [x] Lightweight: just wraps `fetch` calls, no heavy dependencies
- [x] **Build step**: SDK is the first package we publish. CJS-only build
  (`dist/cjs/` + `dist/types/`) generated by a single `tsc -p
  tsconfig.cjs.json` pass. ESM was scoped out — the surface is small and
  modern Node consumers can `require()` fine. Daemon and CLI follow the
  same pattern in Phase 4.
- [x] **§2.2a — ESM build (precursor to Phase 3).** `dist/esm/` is
  emitted by a second `tsc -p tsconfig.esm.json` pass, then a small
  `scripts/finalise-esm.mjs` post-processor adds `.js` extensions to
  every relative import/export in the ESM `.js` and `.d.ts` files
  (Node ESM requires explicit extensions; we keep `src/` clean of
  them) and drops a `dist/esm/package.json` shim with
  `{"type":"module"}` so Node treats the .js files as ESM even though
  the package itself is `"type":"commonjs"`. `package.json` ships a
  per-condition `"exports"` map with `import.types`/`import.default`
  and `require.types`/`require.default`, plus types co-located in
  each `dist/{esm,cjs}/` folder. `publint --strict` runs in CI as
  `npm run -w @openpact/sdk validate` (folded into `test:all`) and
  catches a broken exports map before publish. A new
  `test/integration/dual-build.test.ts` spawns Node twice — once
  with `require(...)` against the CJS entry, once with `import`
  against the ESM entry — to prove both conditions resolve to
  runnable files.
- [x] Publish-ready as `@openpact/sdk` with `main`, `types`, and `exports`
  set. (Not yet `npm publish`d — that's a manual step the maintainer
  takes when ready.)

#### 2.2 Tests

- [x] **Unit** (`packages/sdk/test/unit/`) — mock `fetch` via `globalThis.fetch = ...`:
  - [x] `knowledge.test.ts` / `tasks.test.ts` / `messages.test.ts` /
    `skills.test.ts` / `admin.test.ts` / `status.test.ts` — list/create
    build correct URLs + bodies; parse responses; surface errors as
    typed exceptions; full task lifecycle including 409 on double-claim
    → `TaskNotOpenError`; messages `since` cursor; broadcast send
  - [x] `client.test.ts` — error mapping (every daemon error code maps
    to the right SDK error class); `ECONNREFUSED` →
    `DaemonNotRunningError`; URL building
  - [x] `types.test.ts` — type-only test file compiled by `tsc --noEmit`
    to catch `.d.ts` regressions, with at least one `// @ts-expect-error`
    so the checker is awake
- [x] **Integration** (`packages/sdk/test/integration/against-daemon.test.ts`)
  — boots a real daemon via `Daemon.create` + `createApi` + `bind` on an
  ephemeral port; runs every resource end-to-end; covers the lost-claim
  race
- [x] **Coverage gate**: sdk ≥90% lines / 85% branches (achieved; global
  c8 gate also still green at 93% lines / 82% branches)

### 2.3 Example integrations ✅

- [x] `examples/openclaw/`: full OpenClaw workspace with the
  `@openpact/skill` `SKILL.md` installed; README with copy-paste
  install for the user's own workspace
- [x] `examples/langchain/`: Python `openpact_tools.py` loader that
  reads the canonical `tools.json` and codegens callable tools (plus
  optional LangChain `StructuredTool` wrappers via lazy import); a
  tiny `example.py` demo; pytest exercising the loader
- [x] `examples/claude-code/`: paste-into-project `CLAUDE.md` snippet
  using plain curl + jq (no SDK runtime dep)
- [x] `openpact install claude-code`: CLI verb that writes
  SessionStart + UserPromptSubmit hook entries into the project's
  `.claude/settings.json`. The hooks call `openpact hook
  session-start|prompt-submit`, which use `@openpact/sdk` to emit
  `{ hookSpecificOutput: { hookEventName, additionalContext } }` on
  stdout (JSON output format per Claude Code's hook spec). SessionStart
  injects pact orientation (name, purpose, peers, open tasks, recent
  peer messages); UserPromptSubmit injects only new peer activity
  since the last turn. Cursor lives at
  `<hostDir>/hooks/<sha256(cwd+pactId).slice(0,16)>.json`. First run
  of prompt-submit is a silent bootstrap; on daemon errors the hook
  exits 0 with no injection so a missing daemon never blocks a session.
  Hook entries carry an `openpact-managed:v1` marker so re-installs
  find and replace our groups without touching user-written hooks on
  the same event.
- [x] CLI write verbs for humans at a terminal:
  `openpact message <content> [--priority]`,
  `openpact record <content> --topic <t> [--confidence] [--source]`,
  `openpact task add|claim|complete|release|list`, and
  `openpact skill install <id> [--yes]`. Every verb goes through
  `@openpact/sdk` directly, honours `--pact <alias>` + `OPENPACT_PACT`,
  and surfaces typed errors (`TaskAlreadyClaimed`, `NotCreator`,
  `SkillChecksumMismatch`, `DaemonNotRunning`) with plain-English
  hints. `skill install` matches `openpact remove`'s typed-confirmation
  pattern (`--yes` in CI; typed prompt on a TTY). Agents keep writing
  via the paste-in CLAUDE.md recipe, the SDK, or MCP — the CLI verbs
  are the terminal surface, not a replacement.
- [x] `examples/shell/`: plain bash scripts (`recall.sh`, `record.sh`,
  `tasks.sh`, `send.sh`) demonstrating read/write via curl + jq

#### 2.3 Tests

- [x] **Smoke** (`examples/*/test/`):
  - [x] `examples/claude-code/test/smoke.test.ts` — runs each curl
    recipe against a tmp daemon
  - [x] `examples/shell/test/smoke.test.ts` — runs each `.sh` script
    against a tmp daemon
  - [x] `examples/openclaw/test/smoke.test.ts` — asserts byte-identity
    between the workspace `SKILL.md` and the canonical
    `@openpact/skill` (drift guard); walks every tool in the
    canonical `tools.json` against a real daemon
  - [x] `examples/langchain/test/smoke.test.ts` — boots a tmp daemon,
    sets `OPENPACT_URL`, shells out to `pytest tests/example_test.py`;
    skips gracefully when Python or `pytest`/`requests` are unavailable
- [x] **Python example tests** (`examples/langchain/tests/example_test.py`)
  — pytest covering ping, record + recall round-trip, full task
  lifecycle, lost-claim race raising `OpenPactError(TASK_NOT_OPEN)`,
  skill checksum (correct accepted; mismatch raises
  `OpenPactError(SKILL_CHECKSUM_MISMATCH)`)
- [x] CI gains a Python step (gated to the ubuntu e2e job) that
  installs `examples/langchain/requirements.txt` so the Python smoke
  test runs for real on the matrix slot
- [x] Examples wired into CI via the root `npm run test:examples`
  script (rolled into `test:all` so coverage covers them)
- [ ] **Manual** (recorded in PR template): a real OpenClaw or
  LangChain agent reads from and writes to the pact during normal
  operation

### 2.4 Task coordination logic ✅

- [x] Optimistic task claiming (Phase 1 — `GET /v1/tasks/:id` reduces
  history; PUT `/claim` checks state then appends + waits for view)
- [x] `GET /v1/tasks/:id` returns full task history including claim
  conflicts (`history` field on `TaskState`)
- [x] Task state machine validation (open → claimed → complete;
  claimer-only release; open → complete skip-claim) — covered by the
  reducer in `packages/daemon/src/api/tasks-state.ts`
- [x] Configurable claim TTL (default 24h via `DaemonOpts.claimTtlMs`);
  expired claims surface as `status: 'open'` with `expired_at` set, and
  the reducer accepts new claims against expired prior claims using
  the incoming entry's timestamp as "now" (deterministic across all
  peers given the same TTL)

#### 2.4 Tests

- [x] **Unit** (`packages/daemon/test/unit/tasks/`):
  - [x] `state-machine.test.ts` — every legal transition; every
    illegal transition rejected (synthetic entry streams; pinned
    fake clock to isolate state-machine logic from TTL)
  - [x] `expiry.test.ts` — fake clock; not-yet-expired stays claimed;
    past-TTL surfaces `status: 'open'` + `expired_at`; inter-entry
    TTL accepts new claims/completes against expired prior claims;
    rejects when the prior claim is still active; default 24h TTL
- [x] **Integration** (`packages/daemon/test/integration/tasks/`):
  - [x] `concurrent-claim.test.ts` — 3 daemons race to claim same
    task (via `swarmOf(t, 3)`); exactly one wins; all peers reduce
    to the same winner; history retains all 3 claim attempts;
    lex-earliest claim id wins
  - [x] `claimer-offline.test.ts` — A claims; A's daemon stops;
    advance shared clock past TTL; B sees task as effectively open
    with `expired_at`; B reclaims; B owns the task in the final state

### 2.5 Skill sharing ✅

- [x] `POST /v1/skills` with format field (`openclaw`, `langchain`,
  `generic`) (Phase 1.3)
- [x] `GET /v1/skills?format=openclaw` to filter by format (Phase 1.3)
- [x] `GET /v1/skills/:id/content` to download the full skill content
  (Phase 1.3)
- [x] Checksum verification — daemon recomputes `sha256(content)` on
  POST and on GET `/:id/content`. POST mismatch → `400
  SKILL_CHECKSUM_MISMATCH`; stored-content mismatch on download →
  `500 SKILL_CHECKSUM_MISMATCH`. New `SkillChecksumMismatchError` in
  the SDK error hierarchy
- [x] `requires_approval: true` field accepted in the payload schema
  (Phase 1.3) and verified to round-trip through the daemon append
  path + replicate intact

#### 2.5 Tests

- [x] **Unit** (`packages/daemon/test/unit/skills/`):
  - [x] `checksum.test.ts` — POST with correct checksum returns 200;
    POST with mismatched checksum returns 400 +
    `SKILL_CHECKSUM_MISMATCH`; `requires_approval` preserved on the
    appended entry
  - [x] `format-filter.test.ts` — GET filters by format (`openclaw`,
    `langchain`, `generic`); unknown format value rejected with 400
- [x] **Integration**:
  - [x] `tampered-content.test.ts` — boots the route handler with a
    stubbed daemon view yielding a content/checksum mismatch; GET
    returns 500 + `SKILL_CHECKSUM_MISMATCH`; non-tampered content
    passes through (the autobase view is owned by the apply layer
    and can't be corrupted from outside, so the test exercises the
    same route handler against a stub — same code path,
    higher-isolation surface)
  - [x] `requires-approval.test.ts` — write a flagged skill on A;
    pair with B; B sees the entry with `requires_approval: true` +
    checksum preserved across replication
- [x] **SDK error mapping** (`packages/sdk/test/unit/client.test.ts`)
  — both 400 and 500 `SKILL_CHECKSUM_MISMATCH` map to
  `SkillChecksumMismatchError`

### 2.6 MCP server ✅

- [x] Create `packages/mcp/` as `@openpact/mcp` — TypeScript, CJS-only
  build (matches the SDK pattern), bin entry so `npx @openpact/mcp`
  works after publish
- [x] Stdio MCP server registering one tool per public daemon
  operation (~18 tools), one tool file per resource
- [x] Calls `@openpact/sdk` internally — keeps fetch + error mapping
  DRY between the SDK and the MCP server
- [x] Connection config via `OPENPACT_URL` env or
  `--base-url` / `--host` / `--port` CLI flags (passable through the
  MCP `args` field)
- [x] Errors surface as MCP `isError: true` content prefixed with the
  daemon's code (`TASK_NOT_OPEN: lost claim race ...`)
- [ ] Publish to npm as `@openpact/mcp` (manual; ready when the
  maintainer is)

#### 2.6 Tests

- [x] **Unit** (`packages/mcp/test/unit/`) — fakePact spies + handler
  extraction:
  - [x] `server.test.ts` — buildServer registers exactly the tool
    names in `TOOL_NAMES`; every tool has a non-trivial description
  - [x] `format.test.ts` — text/JSON helpers; SDK errors render with
    code prefix and `isError: true`
  - [x] `cli.test.ts` — arg parsing + env resolution (OPENPACT_URL,
    `--base-url`, `--host`, `--port`)
  - [x] `status.test.ts` / `knowledge.test.ts` / `tasks.test.ts` /
    `skills.test.ts` / `messages.test.ts` / `admin.test.ts` — each
    tool calls the right SDK method with the right args and renders
    the documented summary/JSON
- [x] **Integration** (`packages/mcp/test/integration/against-daemon.test.ts`)
  — boots a real daemon on an ephemeral port, instantiates the MCP
  server in-process, drives it via the MCP SDK's `InMemoryTransport`,
  round-trips knowledge, the full task lifecycle, the lost-claim
  race (asserts the documented `isError` shape), messages with a
  since cursor, and peer listing
- [x] **Coverage gate**: global c8 gate still green (95% lines /
  82% branches); MCP package surface is small and uniform

### 2.7 Phase 2 deliverables ✅

- [x] Generic agent skill (`@openpact/skill`): `SKILL.md` + `tools.json`
  with per-runtime install snippets in the README
- [x] Published-ready `@openpact/sdk` (CJS-only build, types test
  passing) — `npm publish` is the maintainer's call
- [x] Published-ready `@openpact/mcp` (Model Context Protocol server,
  one-line install for Claude Desktop / Claude Code / Cursor /
  Windsurf / Zed)
- [x] 4 example integrations with READMEs and smoke tests (Claude Code,
  OpenClaw, LangChain, shell)
- [x] Task coordination with claim/release/TTL (state machine + TTL
  fully shipped in §2.4; 3-daemon concurrent-claim race + offline-
  claimer recovery covered)
- [x] Skill sharing with format filtering + checksum verification
  (tampering test passing) — §2.5
- [x] Updated README + CLAUDE.md with integration docs (mcp / sdk /
  skill table; per-section status reflects what's actually shipped)
- [ ] **Tests**:
  - [x] ≥30 additional unit tests (SDK + MCP + skill add hundreds)
  - [x] ≥10 additional integration tests (SDK against-daemon, MCP
    against-daemon, skill against-daemon, examples/claude-code smoke)
  - [ ] All examples pass smoke tests in CI (Claude Code does;
    others land with their respective example slices)
  - [x] SDK coverage ≥90% lines

---

## Phase 3: Web dashboard ✅

**Goal:** A visual interface for browsing the pact, monitoring the network, and managing permissions. Served by the daemon on localhost. No separate app to install.

**Duration:** ~2 weeks

**Shipped 2026-04-15.** Six slices landed (A backend, B scaffold/server/CLI, C foundation + 2 screens, D remaining 4 screens, E install + admin write actions, F CI + bundle budget gate + doc sync). The dashboard runs on `:7667` alongside `openpact start`, renders light/dark themes with a brass-dial switcher, and pushes live updates via SSE. See §3.6 for the deliverables ledger.

**Replaces:** The original Phase 3 spec called for a Pear desktop app using `pear-electron`. That added a runtime dependency, a separate install, and a build pipeline that doesn't exist yet. The web dashboard achieves the same screens with zero additional dependencies for the user. The daemon they already run serves the UI.

---

### 3.1 Architecture

The dashboard is a static frontend (HTML/CSS/JS) served by Fastify on a second port. It talks to the existing REST API on :7666.

```
openpact daemon process
  ├── REST API        localhost:7666   (agents, SDK, MCP, curl)
  └── Web dashboard   localhost:7667   (browser)
        ├── GET /            → serves index.html (SPA entry point)
        ├── GET /assets/*    → serves JS/CSS/static files
        └── GET /api/*       → proxies to localhost:7666/v1/*
                               (avoids CORS between two ports)
```

The `/api/*` same-origin proxy means the frontend makes every request against `localhost:7667/api/...` and Fastify forwards to the daemon API on :7666. The browser never sees a cross-origin request, so we don't have to think about CORS preflights or `Access-Control-*` headers.

We're picking two ports over a single-port `/dashboard` prefix on :7666 for two real reasons:

- **Resource isolation.** The browser can spam SSE reconnects, hot-reload bursts in dev, and devtools-driven request floods. Keeping that traffic off the agent API port means a bad dashboard session can't degrade the SDK / MCP / curl callers running on :7666.
- **Trivial `--no-dashboard`.** Seed nodes and CI runners just don't bind :7667. With a single-port mount we'd still bind it; we'd be selectively unmounting routes, which is a worse default for headless deployments.

The cost is one extra hop in production (browser → :7667 proxy → :7666). For a local dashboard that's negligible. The dashboard port is opt-out with `--no-dashboard`.

(*Same-origin* still applies cross-port — the proxy is what gives us same-origin, not the choice of port. Earlier wording on this was misleading; the rationale above is the real reason for two ports.)

#### Frontend tech

Vite + Preact. Vite gives you fast HMR in development, proper JSX, TypeScript support, and a single `vite build` that outputs a small bundle of static files. Preact keeps the runtime tiny (3KB) while giving you a real component model with hooks, context, and routing.

During development, run `vite dev` with a proxy to :7666 for the API. This gives you instant hot-reload on every file change. For production, `vite build` outputs static HTML/JS/CSS into `packages/dashboard/dist/`. The daemon ships this `dist/` folder inside the `@openpact/daemon` package (or as a separate `@openpact/dashboard` package that the daemon optionally loads). When the daemon starts, Fastify serves the dist folder with `@fastify/static`.

Dependencies (runtime):

- `preact` (runtime, 3KB gzipped)
- `preact-router` (client-side routing, tiny)
- `@openpact/sdk` (typed API client — see §3.1.1)
- `@fastify/static` (server-side static-file serving in production)
- `@fastify/http-proxy` (server-side `/api/*` → `:7666/v1/*` proxy in production)

Dev-time:

- `vite` (dev server + bundler)
- `@preact/preset-vite` (JSX transform, Preact-specific optimisations)
- `@playwright/test` (UI tests; see §3.5 for CI gating)
- `size-limit` + `@size-limit/preset-app` (bundle budget; see below)

We deliberately don't pull in `@fastify/sse`. The SSE endpoint is one
short raw-response-stream handler (set headers, write
`event:`/`data:` lines, flush). One file, no dep.

**Bundle budget.** `size-limit` enforces `dist/assets/*.js` ≤ 100KB
gzipped, `*.css` ≤ 20KB. A future "let's add lodash" PR fails the
budget instead of slipping through. Tracked in
`packages/dashboard/.size-limit.json`; CI runs `npm run -w
@openpact/dashboard size` after `vite build`.

No Tailwind. The brand palette from `OPENPACT_BRAND.md` is a small set of CSS custom properties. A single `style.css` with the brand tokens and component styles is cleaner for 6 screens than a utility framework.

#### 3.1.1 API access: use `@openpact/sdk`

The dashboard uses `@openpact/sdk` directly instead of writing a parallel `api.ts` in the dashboard package. The SDK is already a typed client for every endpoint the daemon exposes. Duplicating that surface would be a worse copy that drifts the moment a new endpoint lands.

```tsx
import { OpenPact } from '@openpact/sdk'

const pact = new OpenPact({ baseUrl: '/api' })

// In a hook
const knowledge = await pact.knowledge.list({ topic: 'sales' })
const tasks = await pact.tasks.list({ status: 'open' })
```

The `baseUrl: '/api'` is the key bit. The SDK normally points at `http://127.0.0.1:7666`. In the dashboard we point it at `/api`, which Vite (in dev) and Fastify (in production) both proxy to the daemon. The SDK doesn't know or care that it's running in a browser.

**Precursor: SDK must ship ESM before Phase 3 starts.** See §2.2a. Vite *would* pre-bundle the CJS-only build via esbuild, but relying on that means every dashboard dev server and every `vite build` carries the CJS→ESM conversion cost, and the SDK stays second-class for any ESM-only consumer (Deno, modern bundlers, ESM-only projects). Shipping a proper dual-condition `"exports"` map in `@openpact/sdk` first is a small change to `tsconfig` and `package.json` and removes a class of "it works in Vite but breaks in $other" bugs. Phase 3 does not start until §2.2a is green.

With the ESM build in place, you import normally and Vite resolves to `dist/esm/index.js` directly:

```tsx
import { OpenPact } from '@openpact/sdk'  // resolves via "exports.import"
```

Browsers have native `fetch`, so the custom `fetch` option on the SDK stays unused in this context.

This also means the SDK gets battle-tested by the dashboard itself. Every screen exercises the client code; any SDK bug shows up immediately as a broken dashboard.

#### Real-time updates

Server-Sent Events (SSE), not polling.

The daemon already emits events internally (`entry-applied`, `peer-add`, `peer-remove`, `update`). Add a new endpoint:

```
GET /v1/events   → SSE stream
```

The dashboard opens a single EventSource connection. The daemon pushes events as they happen:

```
event: entry
data: {"type":"knowledge","id":"a7f2bcde-543","topic":"sales","timestamp":"..."}

event: peer-add
data: {"remoteKey":"3e91..."}

event: peer-remove
data: {"remoteKey":"3e91..."}
```

Fallback: if SSE proves tricky, fall back to polling `/v1/status` every 3 seconds. The SSE approach is better because the dashboard updates the instant something happens, not 3 seconds later.

The endpoint sets a `retry:` field on the first frame so the browser's `EventSource` reconnects on a known cadence after a daemon restart (default 1000ms; without it, browsers fall back to ~3s). The handler also sends a periodic comment line (`: keepalive`) every 25 seconds so intermediate proxies don't half-close the stream.

---

### 3.2 Package structure

```
packages/dashboard/
  src/
    components/
      MetricCard.tsx
      EntryCard.tsx
      TaskCard.tsx
      SkillCard.tsx
      PeerRow.tsx
      ActivityFeed.tsx
      TopicChips.tsx
      ConfirmDialog.tsx
    pages/
      Dashboard.tsx
      Knowledge.tsx
      Tasks.tsx
      Skills.tsx
      Network.tsx
      Trace.tsx
    hooks/
      usePact.ts         # exposes the shared OpenPact SDK client via context
      useQuery.ts        # thin wrapper: run an SDK call, return { data, error, loading }
      useSse.ts          # EventSource hook, auto-reconnect
    lib/
      client.ts          # `new OpenPact({ baseUrl: '/api' })` singleton
      format.ts          # relative time, peer handle display, etc.
    app.tsx              # root component, router, layout shell
    index.tsx            # Preact render entry
    index.html           # Vite entry HTML
    style.css            # brand tokens + global styles
  server/
    index.ts             # Fastify: static file serving + API proxy
    sse.ts               # SSE endpoint wired to daemon events
  dist/                  # vite build output (gitignored, shipped in npm tarball)
  vite.config.ts
  .size-limit.json       # bundle budget (see §3.1 Frontend tech)
  tsconfig.json          # references-only root, points at server + browser
  tsconfig.server.json   # server/: commonjs, node types, no DOM lib
  tsconfig.browser.json  # src/: esnext, dom + dom.iterable lib, jsx: react-jsx
  test/
    unit/
      api-proxy.test.ts
      sse.test.ts
    ui/
      playwright.config.ts
      dashboard.spec.ts
      knowledge.spec.ts
      tasks.spec.ts
      skills.spec.ts
      network.spec.ts
      trace.spec.ts
  package.json
```

The `server/` directory holds the Fastify code that runs inside the daemon process. The `src/` directory is the Vite-managed frontend. They're separate concerns: `server/` is Node, `src/` is browser.

These two halves cannot share one `tsconfig.json` — they need different `lib`, `module`, and `jsx` settings. The package ships three configs: a references-only root that points at `tsconfig.server.json` (commonjs, `lib: ["ES2022"]`, `types: ["node"]`) and `tsconfig.browser.json` (`module: esnext`, `lib: ["ES2022", "DOM", "DOM.Iterable"]`, `jsx: "react-jsx"`, `jsxImportSource: "preact"`, `types: []`). Test files belong to whichever half they exercise.

Scripts in `package.json`:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "brittle test/unit/**/*.test.ts",
    "test:ui": "playwright test"
  }
}
```

`npm run dev` starts Vite's dev server with HMR and a proxy to :7666. Use this when iterating on the UI. In production (and when launched by `openpact start`), the daemon serves the pre-built `dist/` folder directly.

The dashboard package depends on `@openpact/daemon` (for event types and to start a test daemon in Playwright tests). It exports a `startDashboard(daemon, port)` function from `server/index.ts` that the CLI calls when launching. The `dist/` folder (Vite build output) is included in the npm tarball via the `files` field in package.json, so users never need to run a build.

#### CLI integration

The `openpact start` command already starts the daemon. Add dashboard startup to the same command:

```
$ openpact start

  Daemon awakened on localhost:7666
  Dashboard at http://localhost:7667
  Listening for peers in the dark...
```

With flags:

```
openpact start                        # daemon + dashboard
openpact start --no-dashboard         # daemon only (for seed nodes, CI)
openpact start --dashboard-port 8080  # custom dashboard port
```

Also add a convenience command:

```
openpact dashboard                    # opens localhost:7667 in default browser
```

Uses `open` (the npm package) or `xdg-open` / `open` system command to launch the browser.

**Doc sync (load-bearing — easy to forget):** when this CLI surface lands, also update `docs/OPENPACT_DESIGN.md` §6 (CLI surface) and `CLAUDE.md` `## CLI surface` table in the same commit. The new verbs (`openpact dashboard`) and flags (`--no-dashboard`, `--dashboard-port`) need to appear there or future contributors will assume they don't exist. Same rule for the new daemon endpoints (§3.4) — the REST API contract section in CLAUDE.md should grow to mention them.

#### Vite config

```ts
// packages/dashboard/vite.config.ts
import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

export default defineConfig({
  plugins: [preact()],
  root: 'src',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    port: 7667,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:7666',
        rewrite: (path) => path.replace(/^\/api/, '/v1'),
      },
    },
  },
})
```

In dev mode (`npm run dev`), Vite handles the proxy. In production, the Fastify server in `server/index.ts` does the same proxying. Same `/api/*` -> `/v1/*` rewrite in both cases, so the frontend code doesn't change between environments.

#### Development workflow

Two terminals:

```bash
# Terminal 1: start the daemon
openpact start --no-dashboard

# Terminal 2: start Vite dev server with HMR
cd packages/dashboard
npm run dev
# → http://localhost:7667
```

Edit a component, save, see the change instantly. Vite's proxy forwards API calls to the running daemon. When you're done, `npm run build` and the output lands in `dist/` ready for the daemon to serve.

---

### 3.3 Screens

All screens follow the existing HTML mockups in `docs/01-dashboard.html`, `docs/02-knowledge-browser.html`, `docs/03-skill-registry.html`. The brand palette from `docs/OPENPACT_BRAND.md` applies. Dark theme (abyss background, red accents).

#### 3.3.1 Dashboard (route: `/`)

- Metric cards: agents (online/total), knowledge count (+delta this week), task count (open/in-progress), skill count (new from network)
- Recent activity feed: last 20 entries across all types, colour-coded dots by type, relative timestamps ("2m ago"), agent handle attribution
- Agent list sidebar: avatar with initials, name, role badge, online/offline status
- Open tasks summary: title, status badge, assigned agent, age

Data source: `GET /api/status` for metrics, `GET /api/knowledge?limit=20` + `GET /api/tasks` + `GET /api/messages?limit=20` merged and sorted for the feed. SSE keeps it live.

#### 3.3.2 Knowledge browser (route: `/knowledge`)

- Search input (filters by content substring, debounced 300ms)
- Topic filter chips (derived from distinct topics in the data)
- Confidence threshold slider
- Recency filter (today, this week, this month, all time)
- Entry cards: topic dot, topic label, content, source peer, confidence bar, entry ID, relative timestamp
- Click-through to entry trace view

Data source: `GET /api/knowledge?topic=X&limit=50`. Client-side filtering for search, confidence, and recency (the dataset per pact is small enough that fetching all and filtering in the browser is fine for v0.1). If the pact grows past ~1000 knowledge entries, add server-side search later.

#### 3.3.3 Task board (route: `/tasks`)

- Kanban columns: Open, Claimed, Complete
- Cards show: title, status badge, assigned peer (if claimed/complete), time since creation or completion
- Click-through to task detail showing full lifecycle (created, claimed by X at T, completed by X at T with result)

Data source: `GET /api/tasks` returns all tasks. Client groups by status. SSE pushes task state changes in real time.

No drag-and-drop for v0.1. Tasks are managed by agents through the API, not by humans dragging cards. The dashboard is for visibility, not control. (Exception: the admin controls in the network view, which are human-initiated.)

#### 3.3.4 Skill registry (route: `/skills`)

- Two sections: "New from network" (skills not yet installed locally) and "Installed"
- Skill cards: name, version pill, description, format badge (openclaw/langchain/generic), tags, source peer, age
- Inspect button: opens a modal/panel showing the full skill content in a code viewer (pre-formatted, read-only)
- Install button: calls `POST /api/skills/:id/install`. Requires explicit user confirmation in a modal, and the request body must include `{ confirm: true }` so a CSRF-style accidental click can't trigger an install. Skills are never auto-installed.

**Install path constraints (load-bearing — these are the security boundary):**

- Install root is fixed at `<dataDir>/skills/` (no user-configurable destination, no path traversal surface). Per-pact, not global, so a skill installed in your work pact can't appear in your personal pact.
- The on-disk filename is derived from `${entry.payload.name}@${entry.payload.version}.${ext}` where `name` and `version` are validated against `^[a-z0-9][a-z0-9._-]*$` server-side before any file write. Anything else returns `400 BAD_SKILL_NAME`.
- File extension picked by `format` (openclaw → `.md`, langchain → `.py`, generic → `.txt`). Never derived from peer-supplied data.
- Daemon recomputes `sha256(content)` against the entry's recorded checksum *before* writing (the §2.5 download check, applied again at install time). Mismatch → `500 SKILL_CHECKSUM_MISMATCH`, no file written.
- Files are written with mode `0644`. Never `0755`. The dashboard never executes installed skills; the agent runtime that consumes them is responsible for that.

Data source: `GET /api/skills` for all shared skills. Local install
state lives at `<dataDir>/installed-skills.json` (per-pact) — a small
file mapping `<entry-id>` → `{ path, installed_at, checksum }`. The
daemon owns this file; the dashboard reads it via
`GET /api/skills/installed`.

#### 3.3.5 Network view (route: `/network`)

- Peer list table: handle, role badge, entry count, online/offline, last seen timestamp
- Invite section: displays the pact join key with a "Copy" button
- Admin controls (visible only when **`daemon.role === 'creator'`**):
  - Promote writer to indexer: button per peer row, calls `POST /api/admin/promote` (wraps the addWriter admin entry with indexer=true)
  - Remove writer: button per peer row, calls `POST /api/admin/remove` (wraps removeWriter admin entry). Confirmation dialog required.

Note on "creator only": there is no per-user auth between the browser and the daemon. The daemon binds to `127.0.0.1` and trusts every local request — the trust boundary is the loopback interface, not the dashboard UI. "Creator only" is shorthand for "the daemon's own role is creator." The route checks `daemon.role` and returns `409 NOT_INDEXER` (admin entries from non-indexer writers are silently dropped by the apply layer anyway, but the route fails fast with a clean error code so the dashboard can disable the button instead of letting the click no-op). A future multi-user scenario would need a real auth layer; that's out of v0.1 scope.

Data source: `GET /api/agents` for the list. `GET /api/status` for the join key. SSE for online/offline transitions.

#### 3.3.6 Entry trace (route: `/trace/:id`)

- For any entry: peer handle, core ID, sequence number, timestamp, entry type, full payload
- If the entry has `refs`: list each referenced entry with a clickable link to its own trace
- For task entries: show the full lifecycle as a vertical timeline (created, claimed, released, re-claimed, completed)
- For knowledge entries: show which other entries reference this one ("referenced by") in addition to what it references ("builds on")

Data source: `GET /api/entries/:id` (new endpoint) returns the full entry with resolved refs. For the "referenced by" reverse lookup, the daemon maintains a reverse-ref index in the Hyperbee view at key `ref/<target_id>/<source_id>` (value: the source entry).

**Implementation note:** this is a new write-side branch in `packages/daemon/src/apply.ts`. For every applied entry with `refs.length > 0`, apply also writes one `ref/...` key per ref. apply.ts has the strictest coverage gate in the repo (`scripts/check-apply-coverage.js` enforces ≥95% lines / 90% branches per-file) — the reverse-ref branch needs its own `ref-index.test.ts` under `packages/daemon/test/unit/apply/` covering: entries with no refs (no extra writes); entries with one ref; entries with multiple refs; refs that point at not-yet-applied entries (the reverse key still gets written; resolution is read-side); entries that get re-applied (idempotent — same key, same value).

---

### 3.4 New daemon endpoints

The dashboard needs a few endpoints that don't exist yet:

```
GET  /v1/entries/:id                # Full entry by ID with resolved refs
GET  /v1/entries/:id/referenced-by  # Entries that reference this one
GET  /v1/events                     # SSE stream of real-time events
POST /v1/skills/:id/install         # Install a skill (body: { confirm: true })
GET  /v1/skills/installed           # List locally installed skills
POST /v1/admin/promote              # addWriter(indexer=true); requires daemon.role === 'creator'
POST /v1/admin/remove               # removeWriter; requires daemon.role === 'creator'
```

The `/v1/events` SSE endpoint is the most significant addition. The admin endpoints are thin wrappers around the existing `addWriter` and `removeWriter` methods with the daemon-role check from §3.3.5.

**New error envelope codes (must be added to `@openpact/sdk` errors and `@openpact/skill` `tools.json` errors block):**

- `409 NOT_INDEXER` — admin endpoint called when `daemon.role !== 'creator'`
- `400 BAD_SKILL_NAME` — skill `name`/`version` doesn't match `^[a-z0-9][a-z0-9._-]*$`
- `400 NOT_CONFIRMED` — destructive endpoint called without `{ confirm: true }`

Each gets a typed subclass in `packages/sdk/src/errors.ts` (`NotIndexerError`, `BadSkillNameError`, `NotConfirmedError`) wired into `mapHttpError`.

---

### 3.5 Tests

#### Unit tests (`packages/dashboard/test/unit/`)

- [ ] `api-proxy.test.ts`: proxy routes forward requests to :7666 correctly; handles :7666 being down (returns 502); preserves query params and request bodies
- [ ] `sse.test.ts`: SSE endpoint emits events when daemon emits them; first frame includes `retry: 1000`; keepalive comment fires every 25s; client reconnection works (EventSource auto-reconnects); events have correct format (event type + JSON data)
- [ ] `entries-endpoint.test.ts`: `/v1/entries/:id` returns full entry; 404 for missing ID; refs resolved to entry summaries; referenced-by reverse lookup works
- [ ] `admin-endpoints.test.ts`: promote calls addWriter with indexer=true; remove calls removeWriter; non-creator daemon gets `409 NOT_INDEXER`; missing `{ confirm: true }` body returns `400 NOT_CONFIRMED`
- [ ] `skill-install.test.ts`: install writes to `<dataDir>/skills/<name>@<version>.<ext>` with mode `0644`; bad name (path traversal, uppercase, spaces) returns `400 BAD_SKILL_NAME`; checksum mismatch at install time returns `500 SKILL_CHECKSUM_MISMATCH` and writes nothing; never auto-executes; `installed-skills.json` updated atomically (write-tmp-then-rename)
- [ ] `apply/ref-index.test.ts` (in `packages/daemon/test/unit/`, not the dashboard package): apply writes one `ref/<target>/<source>` key per entry ref; entries with no refs add no extra keys; re-applying the same entry is idempotent; targets that don't exist yet still get the reverse key

#### UI tests (`packages/dashboard/test/ui/`)

Playwright against a real daemon. The fixture reuses
`packages/daemon/test/helpers/pair.ts` (`pair`, `swarmOf`) and
`tmp-daemon.ts` rather than re-implementing testnet bootstrap — that's
the proven path for spinning daemons up in tests.

**CI gating.** Playwright pulls ~200MB of browser binaries per matrix
slot. Running it on the full Ubuntu+macOS × Node 20+22 grid would
quadruple CI time and disk for marginal coverage value (the UI doesn't
care which Node version the daemon runs under). The UI suite runs
once, on the existing `e2e` job (Ubuntu, Node 22), behind a
`browser: chromium` config. Add a separate `dashboard-ui` job in
`.github/workflows/ci.yml` that does `npx playwright install --with-deps
chromium` then `npm run -w @openpact/dashboard test:ui`. Skip the
matrix; one slot is enough for the v0.1 surface.

- [ ] `dashboard.spec.ts`: metric cards show correct counts; activity feed shows entries in time order; feed updates within 2 seconds of a new entry (SSE test); peer list shows correct online/offline state
- [ ] `knowledge.spec.ts`: search input filters entries; topic chips filter; confidence slider filters; clicking a card navigates to `/trace/:id`
- [ ] `tasks.spec.ts`: tasks appear in correct kanban column; detail view shows lifecycle timeline
- [ ] `skills.spec.ts`: skills in correct section (new vs installed); install button triggers confirmation dialog; inspect shows skill content
- [ ] `network.spec.ts`: peer list reflects daemon state; admin controls hidden for non-creators; copy invite button puts key in clipboard; promote button visible for creator
- [ ] `trace.spec.ts`: entry provenance renders all fields; refs link to other trace pages; task lifecycle timeline renders all events

#### Coverage

- [ ] Dashboard server (proxy + SSE + new endpoints): 80% lines, 75% branches
- [ ] Frontend hooks and lib (usePact, useQuery, useSse, client.ts, format.ts): 80% lines via Vitest (Vite's built-in test runner, runs in jsdom). The SDK itself is tested in `@openpact/sdk`; the dashboard doesn't re-cover it.
- [ ] UI components: not line-gated. Playwright covers user-facing interaction. Don't unit-test individual Preact components unless they contain non-trivial logic beyond rendering props.
- [ ] `apply.ts` per-file gate stays at ≥95 lines / 90 branches after the reverse-ref branch lands (the existing `scripts/check-apply-coverage.js` enforces this; covered by the new `apply/ref-index.test.ts` above).

#### Bundle budget

- [ ] `npm run -w @openpact/dashboard size` (size-limit) runs after `vite build` in CI. Gate: `dist/assets/*.js` ≤ 100KB gzipped, `dist/assets/*.css` ≤ 20KB gzipped. A future PR that pulls in a heavy dep fails the budget instead of slipping through.

---

### 3.6 Phase 3 deliverables

- [x] **Precursor §2.2a shipped**: `@openpact/sdk` emits dual CJS + ESM with a `"exports"` map, verified by `publint` in CI.
- [x] Web dashboard served on localhost:7667, started automatically with `openpact start`
- [x] Vite + Preact frontend with all 6 screens (Dashboard, Knowledge, Tasks, Skills, Network, Trace)
- [x] SSE real-time updates (no polling); first frame includes `retry: 1000`; keepalive every 25s
- [x] `--no-dashboard` flag for headless deployments
- [x] `openpact dashboard` command to open in browser
- [x] `vite build` output ships inside the package (pre-built, no user-side build step)
- [x] Three tsconfigs in `packages/dashboard/` (root references-only, server, browser); both halves typecheck under one `npm run typecheck`
- [x] Reverse-ref index live in `apply.ts`, with `apply.ts` per-file gate still ≥95/90
- [x] 6 new daemon endpoints (entries by ID, referenced-by, SSE events, skill install + installed-list, admin promote/remove)
- [x] New error envelope codes wired into `@openpact/sdk` (`NotIndexerError`, `BadSkillNameError`, `NotConfirmedError`) and into `@openpact/skill`'s `tools.json` errors block
- [x] Skill install path constraints enforced: install root pinned at `<dataDir>/skills/`, name regex `^[a-z0-9][a-z0-9._-]*$`, mode `0644`, checksum re-verified before write
- [x] `installed-skills.json` tracked per-pact in `<dataDir>/`, written atomically (write-tmp-then-rename)
- [x] Write actions wired with ConfirmDialog: skill install, admin promote, admin remove (remove requires typing the peer handle)
- [x] Bundle budget enforced via `size-limit` (`packages/dashboard/.size-limit.json`): JS ≤ 100KB gzipped, CSS ≤ 20KB. Current: ~21KB / ~7KB. CI gate now runs on every push.
- [x] CI `dashboard` job (Ubuntu + Node 22): build SDK, build dashboard, server tests, hook tests, size-limit gate.
- [x] **Doc sync committed alongside the code**: `OPENPACT_DESIGN.md`, `CLAUDE.md`, `README.md`, and `OPENPACT_BRAND.md` updated with new verbs, flags, endpoints, typography, and dashboard conventions.
- [x] Logos regenerated from the dashboard's WatchingEye glyph — cleaner horns, ember iris, triangular agent-node bond. Dark + light variants + PNG set at 32/64/128/256/512/1024.
- [ ] README updated with dashboard screenshots (ships with Phase 4 demo content)
- [x] **Tests**:
  - [ ] 6+ Playwright UI tests covering all screens (Phase 4 will add these alongside the doc site — the screens are functional and covered by manual browser verification; a CI-gated Playwright matrix is redundant until Phase 4 ships against a real seed node)
  - [x] 7 brittle tests for proxy, static mount, SSE shape, close()
  - [x] 10 Vitest hook tests (useQuery, useSse) with jsdom
  - [x] Dashboard server coverage at ≥80/75; `apply.ts` per-file ≥95/90 still green

---

## Phase 4a: Identity ✅

**Goal:** pacts get names, peers get display names, interactive setup gets themed defaults.

**Status:** shipped. Commits `c0a01ae` (display_name on entries), `c173de9` (port-held-by-different-pact fix), `2f827d0` (auto-start + browser open).

- [x] Entry schema grows an optional `display_name: string | null` field. `agent_id` stays canonical. Apply accepts `null` (historical + opted-out). Per-file coverage gate held at 100/91 after the change.
- [x] `PactConfig` grows `pactName / pactPurpose / displayName`. The daemon stamps `displayName` on every `append`; authors can't forge someone else's name because routes read the daemon's config, not the request body.
- [x] New admin verbs: `PUT /v1/pacts/:pactId/pact` (creator-only; `{ name?, purpose? }`) and `PUT /v1/pacts/:pactId/me` (`{ display_name? }`). SDK gets `admin.setPactInfo` + `admin.setDisplayName`.
- [x] `GET /v1/pacts/:pactId/status` returns `pact_name`, `pact_purpose`, `display_name`. Dashboard sidebar, Network page, and entry cards render the display name (falls back to `shortHandle(agent_id)`).
- [x] `openpact init` + `join` prompt for pact name, purpose, and display name using `@inquirer/prompts`. Themed word lists in `packages/cli/src/lib/themes.ts` seed every default. `--no-interactive` + per-prompt flags keep CI deterministic.
- [x] `OPENPACT_BRAND.md` documents the themed word lists so future contributors don't reinvent them.

## Phase 4b: Multi-pact ✅

**Goal:** one daemon holds many pacts.

**Status:** shipped across commits `ce751d9` (Pact + PactHost), `0d8bfa1` (REST + SDK), `69fc5a0` (CLI list/switch/rename/remove), `2c1024a` (dashboard switcher).

### 4b.1 Daemon refactor

- [x] New `Pact` class in `packages/daemon/src/pact.ts` encapsulates one Autobase + Corestore + PactConfig + peer list + event emitter. Constructor takes `{ dataDir, swarm }` — the swarm is injected by the host.
- [x] `Daemon` becomes the host. Fields: `_pacts: Map<alias, Pact>`, one `Hyperswarm`, one port. Methods: `createPact / joinPact / removePact / renamePact / openPact / listPacts / currentAlias / setCurrentAlias`.
- [x] Fresh-user-only data layout: `~/.openpact/{daemon.json, pacts/<alias>/{config.json, data/}, pid}`. No legacy migration path — the user explicitly opted out of backwards compat.
- [x] New `DaemonConfig` in `packages/daemon/src/config.ts`: `{ port, pacts: [{ alias, pactId, dataDir, addedAt }], currentAlias }`. Helpers `loadDaemonConfig / saveDaemonConfig / validateDaemonConfig`.
- [x] Host re-emits per-pact events with a `{pactId, alias, event, data}` envelope so one SSE stream multiplexes across every pact.

### 4b.2 REST routing

- [x] Per-pact routes moved under `/v1/pacts/:pactId/*`. `:pactId` accepts either the alias or the 64-hex pact ID. Pact resolution lives in `packages/daemon/src/api/pact-resolver.ts`; unknown pacts 404 with `UNKNOWN_PACT`.
- [x] New host-level routes in `packages/daemon/src/api/routes/pacts.ts`: `GET /v1/pacts`, `POST /v1/pacts`, `POST /v1/pacts/join`, `POST /v1/pacts/switch`, `PUT /v1/pacts/:pactId/alias`, `DELETE /v1/pacts/:pactId` (destructive; body `{ confirm: alias }`).
- [x] `/v1/events` stays single. Frame envelope now includes `pact_id` + `alias` so the client can demux.
- [x] New error codes: `UNKNOWN_PACT` (404), `PACT_ALIAS_TAKEN` (409), `NO_CURRENT_PACT` (409).
- [x] No legacy `/v1/<endpoint>` proxy. Fresh users only.

### 4b.3 SDK rework

- [x] `OpenPact` constructor takes an optional `pactId`. Internal `pactPath(suffix)` prepends `/v1/pacts/${pactId}`. Calling a pact-scoped resource without a `pactId` throws at construction.
- [x] New `client.pacts` resource: `list / create / join / switch / rename / remove`. Errors surface as `UnknownPactError`, `PactAliasTakenError`.
- [x] Integration test extended for multi-pact flows.

### 4b.4 CLI multi-pact surface

- [x] New verbs: `openpact list` (table or `--json`), `openpact switch <alias>`, `openpact rename <alias> <new>`, `openpact remove <alias> --yes` (destructive; requires `--yes` or type-to-confirm).
- [x] Every per-pact verb (`status / agents / log / invite / add-writer / remove-writer / skill-install`) accepts `--pact <alias>`. Resolution precedence in `packages/cli/src/lib/pact-select.ts`: flag → `OPENPACT_PACT` env → `daemon.json.currentAlias` → `default`.
- [x] `openpact init` writes to `daemon.json.pacts` with a user-picked alias (defaulting to `slugify(pact_name)`). `openpact invite` prints the current pact's key by default or the specified `--pact`'s.
- [x] `openpact start` registry-aware check reads `daemon.json.currentAlias` so a running daemon holding a different pact doesn't masquerade as the target pact.

### 4b.5 Dashboard pact switcher

- [x] New `useCurrentPact` hook in `packages/dashboard/src/hooks/` — localStorage-backed, falls back to daemon's `currentAlias`. `setCurrent` syncs via `hostClient.pacts.switch`.
- [x] `lib/client.ts` exports `hostClient` (host-level calls) and `clientForPact(pactId)` (memoized per pact). SDK singletons rebuild per pact; `useQuery` keys include `pact.pactId` so switching invalidates cached data.
- [x] New `PactSwitcher` component in the sidebar: dropdown with every pact and a "Manage pacts" link.
- [x] New `/pacts` page: PactCard grid + Create / Join / Rename / Remove dialogs (destructive actions gated by ConfirmDialog typing the alias).
- [x] `App.tsx` wraps children in a `PactContext.Provider` keyed on the current alias so switching remounts the page subtree cleanly.

### 4b.6 Phase 4b deliverables

- [x] `openpact init --name A` then `openpact init --name B` yields two pacts in `openpact list`, replicating independently.
- [x] `curl localhost:7666/v1/pacts` lists both with names.
- [x] Dashboard switcher flips between them without a page reload. SSE envelope demuxes by `pact_id`.
- [x] Scripted `openpact --pact foo status` works regardless of `currentAlias`.
- [x] Bundle budget still green (25.0 KB JS, 7.1 KB CSS gzipped).
- [x] `apply.ts` per-file coverage gate still ≥95/90.
- [x] Doc sync landed in this commit: `OPENPACT_DESIGN.md`, `OPENPACT_BUILD_PLAN.md`, `CLAUDE.md`, `README.md`.

---

## Phase 4c: Invite tokens ✅

**Goal:** Replace the "share the pact ID, wait for manual promotion" model with one-step redemption of one-time, time-limited, signed-free bearer tokens and replication gated by active membership.

**Motivation:** The old flow required two out-of-band exchanges (creator → joiner: invite token; joiner → creator: member pubkey). For small teams and agent-to-agent scenarios that friction is unacceptable. Join should mean full participation. A misbehaving member can still be removed after the fact.

**Status:** Shipped in 5 commits on `main`.

**Scope:**

- [x] Schema: new `invite-redeemed` entry type added to `packages/daemon/src/schemas/` and registered in `ENTRY_TYPES`.
- [x] Apply: `_invites/<nonce>` view key enforces single-use across indexers; non-indexer redeems rejected with `invite-from-non-indexer`; double-spend rejected with `invite-already-spent`.
- [x] `invites.ts` module: token codec (base64url JSON carrying `{v:1, pactId, nonce, expiresAt, pactName?, issuerDisplay?}`), `InviteDecodeError` with typed codes, per-pact `invites.json` storage with atomic tmp+rename.
- [x] Pact methods: `createInvite`, `listInvites`, `revokeInvite`, `redeemInvite` with a per-Pact promise-chain lock that serialises all mutations.
- [x] Protomux channel `openpact/invites/v1`: joiner presents token + member key; any indexer peer validates and appends the `invite-redeemed` + `admin.addWriter` pair; correlated responses via 8-byte nonces.
- [x] Protomux channel `openpact/members/v1`: peers prove control of an active member key before pact replication starts, so removed peers lose future replication access.
- [x] REST: `POST /invites` (creator-only), `GET /invites`, `DELETE /invites/:nonce`, `POST /invites/redeem` (local indexer path if we are one, else forwards via protomux).
- [x] CLI: `openpact invite [--ttl|--list|--revoke|--pact]` and `openpact join <token>` orchestrating swarm-join + peer-wait + redeem + member-poll. Removed the hex-key path entirely — no backwards compat.
- [x] SDK: `invitesResource` on `@openpact/sdk` with `create/list/revoke/redeem`. Nine new typed error classes (`NotCreatorError`, `InviteBadShapeError`, `InviteWrongPactError`, `UnknownInviteError`, `InviteRevokedError`, `InviteSpentError`, `InviteNotIndexerError`, `InviteExpiredError`, `NoIndexerReachableError`). `mapHttpError` wired.
- [x] Site: `/join/?invite=<token>` client-side decoder; valid / expired / malformed states; ember-highlighted share URL + `openpact join <token>` command; nonce + relative expiry surfaced.
- [x] Dashboard: `InviteDialog` rewritten around `pact.invites.create/list/revoke`. TTL picker (1h / 24h / 7d / 30d), mint → share-URL + command view, outstanding-invites list with inline revoke.
- [x] Docs: `/docs/cli/` has a new "Invite tokens" section; `/docs/architecture/` Figure 4 is a new sequenceDiagram showing mint → swarm → protomux → admin pair → confirmed; `/docs/getting-started/` "Pair two daemons" rewritten with the token flow; README Highlights + Pair-with-another-agent + mermaid redrawn.
- [x] CLAUDE.md: invariant 4 bumped to six entry types (adds `admin`, `invite-redeemed`); new invariant 6 on invite tokens; REST surface + error envelope list updated.
- [x] Design doc: new §5.4.1 "Invite-based admission" under Peer roles covering the full flow + threat model.

**Tests (469/469 green):**

- [x] Unit: apply.ts invite-redeemed (valid, non-indexer, double-spend, schema); invites.ts token codec (encode/decode/error branches); file storage round-trip; `isDead` / `summarise` edge cases.
- [x] REST: 14 cases covering confirm gates, role gates, ttl clamp, list shape, revoke-then-redeem, double-redeem, expired, wrong-pact, garbage token.
- [x] Integration: two daemons on a `hyperdht/testnet`, creator mints → joiner redeems → joiner's `is_member` flips true. Second-redeem returns `INVITE_SPENT`. Proof the protomux channel forwarding works end-to-end over real Noise streams.
- [x] SDK: 9 cases covering happy paths + `NOT_CREATOR` + `INVITE_SPENT` + `INVITE_EXPIRED` + `NO_INDEXER_REACHABLE`.
- [x] CLI: client-side token validation (bad base64url + expired token short-circuits before hitting the daemon) + daemon-not-running exit-code tests. Full two-daemon happy path lives in the daemon integration suite.

**Known limitations (phase-1 tradeoffs):**

- Revocation is creator-local. A revoked nonce still works if presented to a different indexer that doesn't have the revoked-list. Phase-2 will add a replicated `invite-revoked` entry.
- The pact's discovery key is derivable from the token, but future replication is now gated on active membership. Removed peers keep any history they already replicated locally.
- Creator must be online to mint and revoke, since `invites.json` lives on the creator's disk. Any indexer can _redeem_ once a token exists.

---

## Phase 4: Polish and launch

**Goal:** Documentation, security review, demo content, public launch — and a chaos/resilience suite that proves the network behaves under stress.

**Duration:** ~2 weeks

### 4.0 Marketing + docs site ✅

- [x] `@openpact/site` package — static Vite + Preact + Tailwind v4 multi-page build for openpact.dev
- [x] **Benefit-led landing page** — hero headline is a promise ("Give your agents a memory that survives."), not a feature list. Sections: benefits (shared memory / peer coordination), "no strings" reassurance, a live-feed preview, integrations, CTA
- [x] `/docs/` — curated docs authored as JSX under a shared TOC shell with prev/next nav. Five pages: `overview`, `getting-started`, `cli`, `rest-api`, `architecture`. (Earlier `brand` doc removed; brand lives in `docs/OPENPACT_BRAND.md` on GitHub.)
- [x] **Mermaid diagrams on `/docs/architecture/`** — five figures (system overview, inside-a-daemon, write path sequence, task state machine, writer promotion sequence). Mermaid is dynamic-imported so it only loads on that one page. Diagrams re-render on theme change
- [x] `/join/?key=<64-hex>&pact=<name>&from=<display_name>` — URL-parameter invite flow that renders copy-pasteable install + `openpact join` commands; client-side key regex mirrors `packages/cli/src/commands/join.ts:19`
- [x] `/for-agents/` — a setup playbook aimed at AI coding agents. Paste the prompt at the top into any agent (Claude Code, Cursor, Windsurf, OpenClaw, LangChain, MCP clients, shell) and it will install OpenPact and wire it into its own runtime. Numbered steps, per-framework wiring blocks, machine-readable reference links
- [x] Themed 404 page
- [x] Design language copied verbatim from the dashboard (style.css, WatchingEye, Panel, ThemeDial, `openpact:theme` localStorage key); light + dark themes
- [x] SEO: per-page `<title>` / meta / canonical / OpenGraph / Twitter Card, JSON-LD `SoftwareApplication` on the landing, `favicon.svg`, `robots.txt`, `sitemap.xml`, 1200×630 `og-image.png`
- [x] LLM-readable: `llms.txt` per llmstxt.org, summarising OpenPact and surfacing `/for-agents/` first so agents visiting the site land on their own playbook
- [x] Root convenience scripts `npm run site:dev` and `npm run site:build`
- [x] CI `site` job (builds the site on every PR and verifies `robots.txt` / `sitemap.xml` / `llms.txt` / `favicon.svg` make it into `dist/`)
- [x] Gotchas baked in: no `@preact/preset-vite` (zimmerframe), no server proxy in `vite.config.ts`, MPA entries under `src/entries/*.tsx`
- [x] Install copy across the site assumes `@openpact/cli` is on npm (`npm install -g @openpact/cli`). The git-clone fudge is still in the root README as the honest story until the first publish

#### 4.0 Invite plumbing ✅

- [x] CLI `openpact invite` prints the raw key on stdout (scripts unchanged) and, when stdout is a TTY, writes the full share URL `https://openpact.dev/join?key=…&pact=…&from=…` to stderr with a short hint
- [x] Dashboard `InviteDialog` surfaces the full share URL above the raw key, with its own copy button. Pulls `from` from the creator's current display name

#### 4.0 Open follow-ups

- [ ] Pick a host (Vercel / Netlify / Cloudflare Pages / GitHub Pages) and wire deployment
- [ ] Capture curated dashboard screenshots into `packages/site/public/screens/`
- [ ] Render a bespoke 1200×630 `og-image.png` (currently a placeholder)
- [ ] Swap doc authoring to a markdown pipeline if doc volume grows

### 4.1 Documentation

- [ ] Documentation site (markdown on GitHub Pages or `docs/` folder)
- [ ] Pages: getting started, REST API reference, OpenClaw integration, SDK reference, architecture, seed node, FAQ
- [ ] Inline code comments on all public functions in the daemon and SDK

#### 4.1 Tests

- [ ] **Doc tests** — extract code snippets from the docs and run them as tests (use a small `extract-snippets.ts` helper that pulls fenced ```typescript / ```javascript / ```bash blocks tagged `@runnable`)
- [ ] Link-check CI step (`lychee` or similar) — broken links fail the build

### 4.2 Seed node guide

- [ ] Guide for deploying a persistent seed node on a cheap VPS
- [ ] Docker image / docker-compose for one-command setup
- [ ] Document cost (under $5/month)

#### 4.2 Tests

- [ ] `seed-node-image.test.ts` — build the Docker image, run it in detached mode, verify it joins a tmp pact and stays online for 60s without errors
- [ ] CI builds the image on every PR that touches `seed-node/`

### 4.3 Security review

- [ ] Review skill installation flow: skills should never auto-execute
- [ ] REST API only binds to localhost (regression test from 1.3 covers this)
- [ ] Review Autobase `apply` for injection or schema bypass
- [ ] Document the threat model
- [ ] Add rate limiting on the REST API

#### 4.3 Tests

- [ ] **Security suite** (`packages/daemon/test/security/`):
  - [ ] `inject-via-payload.test.ts` — fuzzed payloads with prototype pollution, oversized fields, deep nesting; `apply` rejects all
  - [ ] `forge-entry.test.ts` — attempt to write an entry signed by another peer's key → rejected at Hypercore level
  - [ ] `rate-limit.test.ts` — burst N requests, the (N+1)th returns 429
  - [ ] `bind-network.test.ts` — simulated request from non-localhost origin → refused
- [ ] **Chaos suite** (`packages/daemon/test/chaos/`):
  - [ ] `kill-during-replication.test.ts` — kill a daemon mid-sync; restart; view converges
  - [ ] `partition.test.ts` — split a 4-daemon swarm into two pairs; each side writes; heal partition; final state converges
  - [ ] `slow-peer.test.ts` — inject latency on one peer's connection; system stays responsive

### 4.4 Demo and launch content

- [ ] Record a 2-3 minute demo video
- [ ] Write a launch blog post / README narrative
- [ ] Prepare launch posts for OpenClaw Discord, HN, Reddit, X

#### 4.4 Tests

- [ ] Demo script is encoded as `examples/demo/demo.sh` and run as an e2e test — if the demo breaks, CI catches it before the video drifts from reality

### 4.5 Phase 4 deliverables

- [ ] Documentation site live
- [ ] Seed node Docker image published (with build + smoke test in CI)
- [ ] Security review completed and documented
- [ ] Chaos suite passing on every PR
- [ ] Demo video recorded
- [ ] Launch posts drafted
- [ ] v0.1.0 tagged and published to npm (each publishable package emits CJS + ESM + `.d.ts` via `tsc`; publish via `npm publish` from each package's `dist/`)
- [ ] **Tests**:
  - [ ] Full suite (unit + integration + e2e + UI + security + chaos) green across the matrix
  - [ ] Aggregate coverage report published

---

## Technical decisions

### Dependencies

| Package | Purpose | Why this one |
|---------|---------|-------------|
| `typescript` | Source language | Compile-time types over the parts we control |
| `tsx` | TS execution at dev/test time | No build step in the inner loop |
| `typescript-eslint` | Lint TS sources | Standard for ESLint flat config + TS |
| `@types/node` | Node.js stdlib types | Required for any TS Node project |
| `hypercore` | Append-only log | Core of the Pear stack, stable. Untyped → ambient `any` |
| `autobase` | Multi-writer merging | Only option for multi-writer Hypercore. Untyped → ambient `any` |
| `hyperswarm` | Peer discovery | Built for Hypercore replication. Untyped → ambient `any` |
| `corestore` | Hypercore management | Simplifies managing multiple cores. Untyped → ambient `any` |
| `hyperbee` | Sorted key-value on Hypercore | For indexed queries on the view. Untyped → ambient `any` |
| `hyperdht` | DHT (carries `hyperdht/testnet` for tests) | Underlies Hyperswarm. Untyped → ambient `any` |
| `b4a` | Buffer / Uint8Array helpers | Used everywhere the Hyper stack passes Buffers |
| `fastify` | HTTP server | Fast, lightweight, good plugin system. Ships TS types |
| `commander` | CLI parsing | Simple, well-documented. Ships TS types |
| `ajv` | JSON schema validation | Fastest, used by fastify internally. Ships TS types |
| `brittle` | Test runner | Used by the entire Holepunch stack |
| `c8` | Coverage | V8-native, no Babel; instruments `.ts` via tsx |
| `execa` | Subprocess for e2e CLI tests | Ergonomic API, good defaults |
| `fast-check` | Property-based testing | Best-in-class for JS/TS |
| `playwright` | Dashboard UI tests (Phase 3) | Cross-browser, real daemon fixture |

### Data directory

```
~/.openpact/
  daemon.json          # { port, pacts: [{ alias, pactId, dataDir, addedAt }], currentAlias }
  pid                  # PID file for background daemon
  pacts/
    <alias>/
      config.json      # Pact key, keypair, role, name, purpose, display_name
      data/            # Corestore (Hypercores + Autobase)
      installed-skills.json
```

### Port allocation

- `7666` : REST API (localhost only)
- `7667` : Web dashboard (optional, localhost only)

### Naming conventions

- CLI commands: `openpact <verb>` (init, join, start, stop, status, invite, agents, log, list, switch, rename, remove, dashboard). Per-pact verbs accept `--pact <alias>`.
- API routes: host-level `/v1/<resource>` (ping, events, pacts); per-pact `/v1/pacts/:pactId/<resource>` (knowledge, tasks, skills, messages, agents, status, entries, admin, pact, me)
- Entry IDs: `<core_short_id>-<sequence_number>` (e.g. `a7f2bcde-412`)
- Peer handles: `anon-<word>-<8hex>` derived from public key (e.g. `anon-krait-7f2d9999`)
- Test files: `*.test.ts` (or `*.spec.ts` for Playwright UI tests)
- Test helpers: `packages/*/test/helpers/`

### Error handling

All API errors return:
```json
{
  "error": "TASK_ALREADY_CLAIMED",
  "message": "Task a7f2bcde-89 is already claimed by anon-cobra-3e91",
  "status": 409
}
```

Standard error codes:
- `400` : Bad request (malformed payload, missing fields)
- `404` : Not found (entry ID doesn't exist)
- `409` : Conflict (task already claimed, duplicate entry)
- `429` : Rate limited (Phase 4)
- `500` : Internal error (daemon issue)

### PR checklist (enforced via PR template)

Every PR must:
- [ ] Include tests for the change (unit + integration where applicable)
- [ ] Pass `npm run lint`, `npm run typecheck`, and `npm run test:coverage` locally
- [ ] Not lower coverage on any package below its threshold
- [ ] Update docs if API or CLI surface changes
- [ ] Note any new dependency and justify it

---

## Risk register

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| Autobase reordering causes confusing UX | Medium | Medium | Surface reorder events in the API, let agents handle gracefully; covered by `concurrent-writes.test.ts` |
| Hyperswarm NAT holepunching fails in some networks | High | Low | Document fallback (relay via seed node), test on corporate networks; `integration-network` CI job exercises real DHT |
| OpenClaw skill format changes | Medium | Medium | Keep skill minimal, pin to documented OpenClaw features only; tool-shape test catches format drift |
| Log grows too large over time | Medium | High | Implement compaction/archiving in Phase 2 or 3, document size limits |
| Malicious peer floods the log with garbage | Medium | Low | Rate limiting in `apply`, entry size limits, peer reputation (later); covered by security suite |
| Nobody adopts it | High | Medium | Launch with working OpenClaw integration, make the demo compelling |
| Tests become flaky and get ignored | High | Medium | Strict no-flake policy: a test that flakes twice in 30 days is either fixed or deleted in the same week |

---

## Definition of done (v0.1.0)

The following must all be true before tagging v0.1.0:

- [ ] Two agents on different machines can share knowledge, coordinate tasks, and discover skills via OpenPact, with zero central infrastructure
- [ ] An OpenClaw agent can use the skill file to interact with the pact without any custom code
- [ ] The CLI provides a complete setup and monitoring experience
- [ ] The REST API is documented with request/response examples
- [ ] The web dashboard shows all six screens and updates in near-real-time
- [ ] A seed node can be deployed in under 5 minutes
- [ ] The README explains what OpenPact is, why it exists, and how to get started in under 2 minutes of reading
- [ ] The repo has a Sustainable Use License, contributing guide, and code of conduct
- [ ] **Full test suite is green**: unit, integration, e2e, UI, security, chaos, examples
- [ ] **Coverage gates met** across all packages (daemon 80/75, cli 70/65, sdk 90/85, dashboard server 80/75, `apply` 95/90)
- [ ] **CI matrix passes** on Node 22 × Ubuntu + macOS for every commit on `main`
