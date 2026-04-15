<!-- BEGIN: openpact recipe — paste this block into your project's CLAUDE.md -->

## Shared memory via OpenPact

This project uses an OpenPact daemon as shared, append-only memory.
Treat it as a long-lived notebook every agent (and the human) reads
and writes. The daemon listens on `127.0.0.1:7666` by default; if it's
not running, the curl commands below will fail with `Connection
refused` — surface that and stop, don't try to start it yourself.

One daemon holds many pacts. Pick which pact these recipes address by
setting `OPENPACT_PACT` to its alias. Leave it unset to use whatever
alias the daemon considers current (`openpact list` marks it with `*`).

```bash
OPENPACT_URL="http://127.0.0.1:7666"
OPENPACT_PACT="${OPENPACT_PACT:-default}"
```

### When to read

- At the start of a non-trivial task, list recent knowledge filtered by
  the relevant topic. If something is on point, factor it in.
- Before proposing an architectural decision or convention change,
  check whether one already exists.

### When to write

- After making a non-obvious call (a tradeoff, a workaround, a chosen
  convention), record it as knowledge with a clear topic. Don't record
  what the diff already shows.
- When you start something other agents might trip over (a long
  refactor, a temporary breakage), broadcast a message.
- When there's work the user wants tracked across sessions, post a
  task instead of a TODO comment.

### Recipes

**List recent knowledge on a topic:**

```bash
curl -sf "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/knowledge?topic=routing&limit=20" \
  | jq '.entries[] | {id, ts: .timestamp, topic: .payload.topic, content: .payload.content}'
```

**Record a discovery:**

```bash
curl -sf -X POST "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/knowledge" \
  -H "content-type: application/json" \
  -d '{"topic":"routing","content":"Use the resolver factory in src/router.ts — the legacy switch in legacy/route-map.ts is deprecated.","confidence":0.9}'
```

**List open tasks:**

```bash
curl -sf "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/tasks?status=open" \
  | jq '.entries[] | {id, title, created_by}'
```

**Post a task for another agent (or future you):**

```bash
curl -sf -X POST "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/tasks" \
  -H "content-type: application/json" \
  -d '{"title":"Migrate auth middleware off legacy session store","description":"Tracking ticket; details in CLAUDE.md decision log."}'
```

**Claim a task before working on it:**

```bash
curl -sf -X PUT "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/tasks/<id>/claim" | jq '.task'
```

If the response is HTTP 409 with `error: "TASK_NOT_OPEN"`, another
agent already owns it — don't fight; pick a different task.

**Complete a task:**

```bash
curl -sf -X PUT "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/tasks/<id>/complete" \
  -H "content-type: application/json" \
  -d '{"result":"PR #123 merged"}' \
  | jq '.task'
```

**Broadcast a short status message:**

```bash
curl -sf -X POST "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/messages" \
  -H "content-type: application/json" \
  -d '{"to":"*","content":"Starting refactor of src/router/*; expect churn for ~30 min."}'
```

**See messages since a cursor:**

```bash
curl -sf "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/messages?since=2026-04-01T00:00:00Z" \
  | jq '.entries[] | {ts: .timestamp, from: .agent_id, to: .payload.to, content: .payload.content}'
```

### Conventions

- **Topics are short and reusable.** `routing`, `auth`, `db-schema`,
  `testing`. Pick from existing topics before inventing a new one
  (`curl -sf "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/knowledge" | jq -r '.entries[].payload.topic' | sort -u`).
- **One fact per entry.** Don't dump a paragraph; record the decision
  and one sentence of reasoning. Future readers can fetch context.
- **Don't echo the diff.** The pact stores knowledge that isn't in the
  code or git history.
- **Check status before assuming the daemon's there:**
  `curl -sf "$OPENPACT_URL/v1/ping"` → `{"ok":true}`.

<!-- END: openpact recipe -->
