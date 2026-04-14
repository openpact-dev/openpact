# OpenPact: Build Plan

> Reference: OPENPACT_DESIGN.md for full functional spec.
> Stack: TypeScript on Node.js, Hypercore, Autobase, Hyperswarm, HyperDHT
> Tests run via `tsx` (no build step in dev/CI); typecheck via `tsc --noEmit`.
> Licence: MIT

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
| `playwright` | Desktop UI tests (Phase 3 only) |
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
| **UI** (Phase 3) | Playwright against the Pear desktop window. | Dashboard renders peer count; clicking task card opens detail. |

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
| `desktop` (Phase 3) | 50% | 40% |

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
    LICENSE (MIT)
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
  - [x] `peer-handle.test.ts` — derived deterministically from public key; matches `anon-<word>-<4hex>` regex
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

- [x] Add `fastify` ^5.8.5 as the HTTP server
- [x] Bind to `127.0.0.1:7331` only (`bind()` helper accepts `127.0.0.1` /
  `::1` / `localhost`; refuses everything else)
- [x] Implement endpoints:
  ```
  GET  /v1/ping                                -> { ok: true }
  GET  /v1/status                              -> { pact_id, peer_handle, role, public_key, peers, entries, is_writer, is_indexer, synced }
  GET  /v1/peers                               -> [{ id, remote_key, online }]
  GET  /v1/knowledge?topic=X&limit=N           -> [entries]
  POST /v1/knowledge                           -> { id, timestamp }
  GET  /v1/tasks?status=open|claimed|complete  -> [reduced TaskState]
  POST /v1/tasks                               -> { id, timestamp }
  GET  /v1/tasks/:id                           -> TaskState (404 if unknown)
  PUT  /v1/tasks/:id/claim                     -> { ok, task }   (409 if not open)
  PUT  /v1/tasks/:id/complete                  -> { ok, task }   (409 if not claimer or already complete)
  PUT  /v1/tasks/:id/release                   -> { ok, task }   (409 if not claimer or not claimed)
  GET  /v1/skills?format=X                     -> [entries]
  POST /v1/skills                              -> { id, timestamp }
  GET  /v1/skills/:id/content                  -> { id, name, version, format, checksum, content }
  GET  /v1/messages?since=TS&to=X              -> [entries]
  POST /v1/messages                            -> { id, timestamp }
  ```
- [x] Request validation via Fastify per-route JSON Schema (rejects with 400 `BAD_REQUEST`)
- [x] Uniform error envelope `{error, message, status}` via `setErrorHandler`
  + `setNotFoundHandler` (so unknown routes also return the envelope)

#### 1.3 Tests

- [x] **Unit** (`packages/daemon/test/unit/api/`) — use `fastify.inject()`, no real port:
  - [x] `ping.test.ts` — returns `{ ok: true }`
  - [x] `status.test.ts` — shape; reflects entry counts after appends
  - [x] `peers.test.ts` — empty initially (no real swarm in unit tests)
  - [x] `knowledge.test.ts` — POST happy path; missing topic → 400; query filter by topic + limit
  - [x] `tasks.test.ts` — full state machine (open→claimed→complete, claimer-only release, double-claim → 409, skip-claim allowed, 404 cases)
  - [x] `tasks-state.test.ts` — pure reducer: race resolution, claimer-only transitions, deterministic order
  - [x] `skills.test.ts` — POST with each format; checksum required; `GET /:id/content` returns content with 404 on unknown
  - [x] `messages.test.ts` — `since` filter; `to: '*'` broadcast; `to: <handle>` direct
  - [x] `errors.test.ts` — every error code returns the correct envelope shape
  - [x] `bind.test.ts` — refuses non-localhost; accepts 127.0.0.1 / localhost
- [x] **Integration** (`packages/daemon/test/integration/api/`):
  - [x] `cross-daemon-api.test.ts` — `pair()`; POST knowledge to A's API; GET knowledge on B's API returns it (also: status entries reflect cross-daemon writes)
  - [x] `task-race.test.ts` — two daemons concurrently claim same task; eventual single winner; both daemons agree; subsequent claim returns 409
- [x] **Coverage gate**: API routes ≥ 85% lines
  - Achieved: API routes 92.81% lines / 85% branches; api folder overall 98.58% / 85%; daemon-wide 95.84 / 83.78; apply.ts 100 / 90.48

**Test checkpoint:** All API tests green (139 tests, 269 asserts). Manual sanity: write a tiny `examples/` script that spins up createApi(daemon) + bind() and curl `localhost:7331/v1/{ping,status,knowledge}` works. (Formal e2e CLI tests land in 1.4.)

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

- [x] Add `commander` ^14 + `picocolors` for the CLI
- [x] Implement commands:
  ```
  openpact init                -> Create a new pact (keypair + Autobase)
  openpact join <key>          -> Join an existing pact
  openpact invite              -> Print the join key for this pact
  openpact start               -> Start the daemon in the foreground
  openpact start --daemon      -> Start in background (detached)
  openpact stop                -> Stop the background daemon
  openpact status              -> Print pact info, peers, entry counts
  openpact peers               -> List connected peers with roles
  openpact log                 -> Print recent entries (tail style)
  openpact log --type knowledge -> Filter by type
  ```
- [x] `openpact status` formats output with colours and aligned labels
- [x] `openpact init` prints clear next steps
- [x] Handle daemon-already-running via PID file (`pidFileLooksAlive` checks
  `process.kill(pid, 0)`); double-start refused with clear error
- [x] **(beyond plan)** `--data-dir <path>` global flag + `OPENPACT_DATA_DIR`
  env var for isolated test runs and multiple pacts on one host
- [x] **(beyond plan)** `--port <n>` flag on `start / status / peers / log` for
  non-default port (also allows running multiple daemons on one host)
- [x] **(beyond plan)** Hidden `start-foreground` subcommand — used by the
  detached path so we can spawn ourselves cleanly

#### 1.4 Tests

- [x] **Unit** (`packages/cli/test/unit/`):
  - [x] `args.test.ts` — every verb is registered; --data-dir is global; start/log carry expected flags; start-foreground is hidden from help
  - [x] `format.test.ts` — formatStatus / formatPeers / formatLogLine for each entry type; colour codes asserted by stripping them
  - [x] `pid.test.ts` — write/read round-trip; stale PID detected; missing file → null
  - [x] `commands.test.ts` — in-process tests for init / join / invite / stop (the commands that don't need a running daemon)
- [x] **End-to-end** (`packages/cli/test/e2e/`) — `execa` with isolated tmp dirs:
  - [x] `init-flow.test.ts` — `init` writes config; second `init` refuses without `--force`; `--force` works
  - [x] `invite-join.test.ts` — `init` then `invite` prints key; `join <key>` writes B's config; bad hex rejected
  - [x] `start-stop.test.ts` — `start --daemon` writes PID and the process is alive; `stop` removes PID and kills the daemon cleanly
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
   `commands/{start,stop,status,peers,log}.ts` showed near-zero coverage
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

### 2.1 OpenClaw skill

- [ ] Create `packages/skill-openclaw/` with the skill file structure
- [ ] Write `SKILL.md` with tool definitions:
  - `openpact-read`: query knowledge by topic, recency, or keyword
  - `openpact-write`: post knowledge, with guidance on what to share
  - `openpact-tasks`: list, claim, complete tasks
  - `openpact-skills`: discover and publish skills
- [ ] Each tool wraps a `curl` call to `localhost:7331`
- [ ] Write installation instructions (copy skill dir to OpenClaw workspace)

#### 2.1 Tests

- [ ] **Unit** (`packages/skill-openclaw/test/unit/`):
  - [ ] `tool-shape.test.ts` — each tool definition parses as valid OpenClaw skill YAML; required fields present
  - [ ] `curl-builder.test.ts` — generated curl commands have correct URL, method, JSON body, error handling
- [ ] **Integration** (`packages/skill-openclaw/test/integration/`):
  - [ ] `tool-against-daemon.test.ts` — boot a daemon via `tmpDaemon()`; invoke each tool's underlying command (extracted into a runnable shell script); assert daemon state changed correctly
- [ ] **Smoke** (manual, documented in README): a real OpenClaw instance reads from and writes to the pact during normal operation. Recorded as a checkbox in the PR template.

**Test checkpoint:** Integration tests pass. Manual OpenClaw smoke logged in PR.

### 2.2 SDK (TypeScript)

- [ ] Create `packages/sdk/` as `@openpact/sdk` — written in TS
- [ ] Simple client class:
  ```typescript
  import { OpenPact } from '@openpact/sdk'

  const pact = new OpenPact({ port: 7331 })

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
  await pact.messages.send({ to: '*', content: 'API endpoint changed' })
  const messages = await pact.messages.since(timestamp)

  // Status
  const status = await pact.status()
  const peers = await pact.peers()
  ```
- [ ] Lightweight: just wraps `fetch` calls, no heavy dependencies
- [ ] **Build step**: SDK is the first package we publish, so it needs a
  `tsc` build that emits both CommonJS and ESM (`dist/cjs/`, `dist/esm/`)
  plus generated `.d.ts`. Daemon and CLI follow the same pattern in Phase 4.
- [ ] Publish to npm as `@openpact/sdk` with `main`, `module`, and `types`
  fields set

#### 2.2 Tests

- [ ] **Unit** (`packages/sdk/test/unit/`) — mock `fetch` via `globalThis.fetch = ...`:
  - [ ] `knowledge.test.ts` — list/create build correct URLs + bodies; parse responses; surface errors as typed exceptions
  - [ ] `tasks.test.ts` — full lifecycle; 409 on double-claim → `TaskAlreadyClaimedError`
  - [ ] `messages.test.ts` — `since` cursor; broadcast vs direct
  - [ ] `errors.test.ts` — every server error code maps to the right SDK error class
  - [ ] `types.test.ts` — type-only test file compiled by `tsc --noEmit` to catch `.d.ts` regressions
- [ ] **Integration** (`packages/sdk/test/integration/`):
  - [ ] `against-daemon.test.ts` — boot a daemon, point SDK at it, run every method; assert end-to-end behaviour
- [ ] **Coverage gate**: sdk ≥90% lines / 85% branches

### 2.3 Example integrations

- [ ] `examples/openclaw/`: Full OpenClaw workspace with the skill installed, README with setup steps
- [ ] `examples/langchain/`: Python script showing a LangChain tool that calls the REST API
- [ ] `examples/claude-code/`: Bash tool or MCP server definition for Claude Code
- [ ] `examples/shell/`: Plain bash scripts demonstrating read/write via curl

#### 2.3 Tests

- [ ] **Smoke** (`examples/*/test/`):
  - [ ] Each example has a `smoke.test.ts` (or `smoke.sh` for shell) that boots a tmp daemon, runs the example, asserts the expected entry appears in the pact
  - [ ] Python example: a tiny pytest that runs the LangChain script against a tmp daemon
  - [ ] Examples are wired into CI as a separate `examples` job (allowed to skip Python on macOS if Python is unavailable)

### 2.4 Task coordination logic

- [ ] Implement optimistic task claiming
- [ ] `GET /v1/tasks/:id` returns full task history including claim conflicts
- [ ] Add task state machine validation (open → claimed → complete; claimer-only release; open → complete skip-claim)
- [ ] Configurable claim timeout (default 24h); expired claims auto-return to `open`

#### 2.4 Tests

- [ ] **Unit** (`packages/daemon/test/unit/tasks/`):
  - [ ] `state-machine.test.ts` — every legal transition; every illegal transition rejected with the right error code
  - [ ] `expiry.test.ts` — fake clock; claimed task past TTL → reverts to open; not-yet-expired stays claimed
- [ ] **Integration** (`packages/daemon/test/integration/tasks/`):
  - [ ] `concurrent-claim.test.ts` — 3 daemons race to claim same task; exactly one wins; losers see 409 after sync; task history shows all attempts
  - [ ] `claimer-offline.test.ts` — A claims, A goes offline, advance fake clock past TTL, B sees task back in `open`, B claims successfully

### 2.5 Skill sharing

- [ ] Implement `POST /v1/skills` with format field (`openclaw`, `langchain`, `generic`)
- [ ] Implement `GET /v1/skills?format=openclaw` to filter by format
- [ ] Add `GET /v1/skills/:id/content` to download the full skill content
- [ ] Add checksum verification on skill download
- [ ] Add a flag for skills that require manual approval: `"requires_approval": true`

#### 2.5 Tests

- [ ] **Unit** (`packages/daemon/test/unit/skills/`):
  - [ ] `checksum.test.ts` — POST with mismatched checksum → 400; correct checksum → 201
  - [ ] `format-filter.test.ts` — GET filters by format; invalid format → 400
- [ ] **Integration**:
  - [ ] `tampered-content.test.ts` — manually corrupt the stored skill content; `GET /:id/content` detects mismatch and returns 500 with `SKILL_CHECKSUM_MISMATCH`
  - [ ] `requires-approval.test.ts` — flagged skills appear in list with the flag preserved across replication

### 2.6 Phase 2 deliverables

- [ ] Working OpenClaw skill (tested with real OpenClaw, smoke logged)
- [ ] Published `@openpact/sdk` on npm with passing types test
- [ ] 4 example integrations with READMEs and smoke tests
- [ ] Task coordination with claim/release/timeout (all transitions tested)
- [ ] Skill sharing with format filtering + checksum verification (tampering test passing)
- [ ] Updated README with integration docs
- [ ] **Tests**:
  - [ ] ≥30 additional unit tests
  - [ ] ≥10 additional integration tests
  - [ ] All examples pass smoke tests in CI
  - [ ] SDK coverage ≥90% lines

---

## Phase 3: Desktop app

**Goal:** A visual interface for browsing the pact, monitoring the network, and managing permissions. Built as a Pear desktop app, with Playwright UI tests.

**Duration:** ~2 weeks

### 3.1 App setup

- [ ] Create `packages/desktop/` as a Pear desktop project
- [ ] Use `pear-electron` for the UI shell
- [ ] Set up the build pipeline (Pear stage, release)
- [ ] Connect to the local daemon's REST API on startup
- [ ] Handle the case where the daemon isn't running (prompt to start it)

#### 3.1 Tests

- [ ] **Unit** (`packages/desktop/test/unit/`):
  - [ ] `api-client.test.ts` — same SDK contract; pure functions for transforming API responses into view-models
  - [ ] `daemon-detect.test.ts` — daemon-not-running state surfaces the prompt
- [ ] **UI bootstrap** (`packages/desktop/test/ui/`):
  - [ ] `playwright.config.ts` launches the Pear app via `pear-electron`'s test harness against a stub daemon
  - [ ] `boot.spec.ts` — app window opens, dashboard loads, no console errors

### 3.2 Dashboard screen

- [ ] Metric cards (peers, knowledge, tasks, skills)
- [ ] Recent activity feed (last 20 entries)
- [ ] Peer list with status badges
- [ ] Open tasks summary
- [ ] Auto-refresh every 5 seconds

#### 3.2 Tests

- [ ] `dashboard.spec.ts` — metric cards reflect stub daemon state; activity feed shows the last 20 entries in correct order; refresh interval observed (use Playwright's clock control)

### 3.3 Knowledge browser

- [ ] Searchable list, topic chips, recency + confidence filters
- [ ] Entry cards with click-through to entry trace

#### 3.3 Tests

- [ ] `knowledge.spec.ts` — search input filters list; topic chips combine; confidence slider filters; clicking a card navigates to trace view

### 3.4 Task board

- [ ] Kanban columns: Open, Claimed, In Progress, Complete
- [ ] Task cards with click-through to detail

#### 3.4 Tests

- [ ] `tasks.spec.ts` — tasks land in the correct column based on status; detail view shows full claim history

### 3.5 Skill registry

- [ ] Grid of skill cards
- [ ] "New from network" and "Installed" sections
- [ ] Install + Inspect buttons

#### 3.5 Tests

- [ ] `skills.spec.ts` — skills appear in correct section; Install button writes to configurable dir (verify via filesystem); Inspect opens code viewer with verified-checksum content
- [ ] `skill-install-safety.spec.ts` — install never auto-executes the skill (regression guard)

### 3.6 Network view

- [ ] Peer list with role, entry count, status, last seen
- [ ] Invite section with copyable join key
- [ ] Admin controls (creator only): promote writer to indexer, remove writer

#### 3.6 Tests

- [ ] `network.spec.ts` — peer list reflects stub state; admin controls hidden for non-creators; promote button calls correct API endpoint

### 3.7 Entry trace

- [ ] Hypercore provenance for any entry
- [ ] Knowledge: refs (what it built on)
- [ ] Task: full lifecycle

#### 3.7 Tests

- [ ] `trace.spec.ts` — given a known entry, all provenance fields render; refs link to other entries; task lifecycle renders all events in order

### 3.8 Phase 3 deliverables

- [ ] Working Pear desktop app
- [ ] All 6 screens implemented
- [ ] Installable via `pear://` link
- [ ] README with screenshots
- [ ] **Tests**:
  - [ ] ≥10 Playwright UI tests covering all 6 screens
  - [ ] ≥5 unit tests for view-model transformers
  - [ ] Desktop coverage ≥50% lines
  - [ ] UI tests run in CI on `ubuntu-latest` (xvfb if needed)

---

## Phase 4: Polish and launch

**Goal:** Documentation, security review, demo content, public launch — and a chaos/resilience suite that proves the network behaves under stress.

**Duration:** ~2 weeks

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
| `playwright` | Desktop UI tests (Phase 3) | Stable Electron support |

### Data directory

```
~/.openpact/
  config.json          # Pact key, keypair, role, daemon port
  data/                # Corestore (Hypercores + Autobase)
  pid                  # PID file for background daemon
```

### Port allocation

- `7331` : REST API (localhost only)
- `7332` : Web dashboard (optional, localhost only)

### Naming conventions

- CLI commands: `openpact <verb>` (init, join, start, stop, status, invite, peers, log)
- API routes: `/v1/<resource>` (knowledge, tasks, skills, messages, peers, status)
- Entry IDs: `<core_short_id>-<sequence_number>` (e.g. `a7f2-412`)
- Peer handles: `anon-<word>-<4hex>` derived from public key (e.g. `anon-krait-7f2d`)
- Test files: `*.test.ts` (or `*.spec.ts` for Playwright UI tests)
- Test helpers: `packages/*/test/helpers/`

### Error handling

All API errors return:
```json
{
  "error": "TASK_ALREADY_CLAIMED",
  "message": "Task a7f2-89 is already claimed by anon-cobra-3e91",
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
- [ ] The desktop app shows all six screens and updates in near-real-time
- [ ] A seed node can be deployed in under 5 minutes
- [ ] The README explains what OpenPact is, why it exists, and how to get started in under 2 minutes of reading
- [ ] The repo has an MIT licence, contributing guide, and code of conduct
- [ ] **Full test suite is green**: unit, integration, e2e, UI, security, chaos, examples
- [ ] **Coverage gates met** across all packages (daemon 80/75, cli 70/65, sdk 90/85, desktop 50/40, `apply` 95/90)
- [ ] **CI matrix passes** on Node 20 + 22 × Ubuntu + macOS for every commit on `main`
