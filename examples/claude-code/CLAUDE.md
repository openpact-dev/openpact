<!-- BEGIN: openpact recipe — paste this block into your project's CLAUDE.md -->

## Shared memory via OpenPact

This project uses an OpenPact daemon as shared, append-only memory.
Treat it as a long-lived notebook every agent (and the human) reads
and writes. The daemon listens on `127.0.0.1:7666` by default. If it
is not running, the curl commands below fail with `Connection
refused`. Surface that and stop. Do not try to start it yourself.

One daemon holds many pacts. Pick which pact these recipes address by
setting `OPENPACT_PACT` to its alias. Leave it unset to use whatever
alias the daemon considers current (`openpact list` marks it with `*`).

The REST API requires a bearer token. It is auto-minted on first boot
into `~/.openpact/daemon.json` with mode 0600. Load it once per
session:

```bash
OPENPACT_URL="${OPENPACT_URL:-http://127.0.0.1:7666}"
OPENPACT_PACT="${OPENPACT_PACT:-default}"
OPENPACT_TOKEN="${OPENPACT_TOKEN:-$(jq -r .apiToken "${OPENPACT_DATA_DIR:-$HOME/.openpact}/daemon.json")}"
AUTH=(-H "Authorization: Bearer $OPENPACT_TOKEN")
```

Every pact-scoped request carries `"${AUTH[@]}"`. `/v1/ping` is the
only route that works without the header.

Prefer automatic reads? Run `openpact install claude-code` once in the
project. It writes SessionStart and UserPromptSubmit hooks into
`.claude/settings.json` so Claude Code injects pact status and new
peer activity at session start and before each prompt. The recipes
below still matter for writes. The install teaches Claude how to read
the pact. It does not teach it when to record to it.

### When to read

- At the start of a non-trivial task, list recent knowledge filtered by
  the relevant topic. If something is on point, factor it in.
- Before proposing an architectural decision or convention change,
  check whether one already exists.

### When to write

- After making a non-obvious call (a tradeoff, a workaround, a chosen
  convention), record it as knowledge with a clear topic. Do not record
  what the diff already shows.
- When you start something other agents might trip over (a long
  refactor, a temporary breakage), broadcast a message.
- When there is work the user wants tracked across sessions, post a
  task instead of a TODO comment.

### Recipes

**List recent knowledge on a topic:**

```bash
curl -sf "${AUTH[@]}" "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/knowledge?topic=routing&limit=20" \
  | jq '.entries[] | {id, ts: .timestamp, topic: .payload.topic, content: .payload.content}'
```

**Record a discovery:**

```bash
curl -sf "${AUTH[@]}" -X POST "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/knowledge" \
  -H "content-type: application/json" \
  -d '{"topic":"routing","content":"Use the resolver factory in src/router.ts. The legacy switch in legacy/route-map.ts is deprecated.","confidence":0.9}'
```

**List open tasks:**

```bash
curl -sf "${AUTH[@]}" "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/tasks?status=open" \
  | jq '.entries[] | {id, title, created_by}'
```

**Post a task for another agent (or future you):**

```bash
curl -sf "${AUTH[@]}" -X POST "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/tasks" \
  -H "content-type: application/json" \
  -d '{"title":"Migrate auth middleware off legacy session store","description":"Tracking ticket; details in CLAUDE.md decision log."}'
```

**Reserve a task for one specific peer:**

```bash
# Only the assigned peer can claim. Others get HTTP 409 NOT_ASSIGNEE.
curl -sf "${AUTH[@]}" -X POST "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/tasks" \
  -H "content-type: application/json" \
  -d '{"title":"Review the auth migration PR","assigned_to":"anon-rat-12345678"}'
```

**Claim a task before working on it:**

```bash
# Response is the full TaskState; no `.task` wrapper.
curl -sf "${AUTH[@]}" -X PUT "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/tasks/<id>/claim"
```

If the response is HTTP 409 with `error: "TASK_NOT_OPEN"`, another
agent already owns it. Pick a different task. If it's HTTP 409 with
`error: "NOT_ASSIGNEE"`, the task is reserved for another peer.

**Complete a task:**

```bash
curl -sf "${AUTH[@]}" -X PUT "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/tasks/<id>/complete" \
  -H "content-type: application/json" \
  -d '{"result":"PR #123 merged"}'
```

**Broadcast a short status message:**

```bash
curl -sf "${AUTH[@]}" -X POST "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/messages" \
  -H "content-type: application/json" \
  -d '{"content":"Starting refactor of src/router/*; expect churn for ~30 min."}'
```

**Thread a reply under an earlier message:**

```bash
curl -sf "${AUTH[@]}" -X POST "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/messages" \
  -H "content-type: application/json" \
  -d '{"content":"Acknowledged; adjusting my branch.","reply_to":"a7f2bcde-411"}'

# Read a thread by asking for everything that refs the parent message:
curl -sf "${AUTH[@]}" "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/entries/a7f2bcde-411/referenced-by" \
  | jq '.[] | {id, ts: .timestamp, from: .agent_id, content: .payload.content}'
```

**See messages since a cursor:**

```bash
curl -sf "${AUTH[@]}" "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/messages?since=2026-04-01T00:00:00Z" \
  | jq '.entries[] | {ts: .timestamp, from: .agent_id, content: .payload.content}'
```

**Long-poll for any new activity (messages, tasks, knowledge, skills):**

```bash
# First call: seed a cursor without blocking.
CURSOR=$(curl -sf "${AUTH[@]}" "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/changes?limit=1" | jq -r .cursor)

# Then loop: block up to 30 seconds for anything new.
while :; do
  RESP=$(curl -sf "${AUTH[@]}" "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/changes?since=$CURSOR&wait=30")
  echo "$RESP" | jq '.entries[] | {type, id, ts: .timestamp}'
  CURSOR=$(echo "$RESP" | jq -r .cursor)
done
```

### Conventions

- **Topics are short and reusable.** `routing`, `auth`, `db-schema`,
  `testing`. Pick from existing topics before inventing a new one
  (`curl -sf "${AUTH[@]}" "$OPENPACT_URL/v1/pacts/$OPENPACT_PACT/knowledge" | jq -r '.entries[].payload.topic' | sort -u`).
- **One fact per entry.** Do not dump a paragraph; record the decision
  and one sentence of reasoning. Future readers can fetch context.
- **Do not echo the diff.** The pact stores knowledge that is not in
  the code or git history.
- **Check status before assuming the daemon is there:**
  `curl -sf "$OPENPACT_URL/v1/ping"` → `{"ok":true}`.

<!-- END: openpact recipe -->
